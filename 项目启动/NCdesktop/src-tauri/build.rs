fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    macos_bridges::build();
}

#[cfg(target_os = "macos")]
mod macos_bridges {
    use std::path::PathBuf;
    use std::process::Command;

    const LIB_NAME: &str = "ncdesktop_bridges";
    const SWIFT_SOURCES: &[&str] = &["asr_bridge.swift", "ocr_bridge.swift"];
    const FRAMEWORKS: &[&str] = &[
        "Foundation",
        "Speech",
        "Vision",
        "CoreGraphics",
        "ImageIO",
        "PDFKit",
        "AVFoundation",
    ];

    pub fn build() {
        let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
        let swift_dir = manifest_dir.join("macos");
        let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let lib_path = out_dir.join(format!("lib{LIB_NAME}.a"));

        let sdk_path = run_capture("xcrun", &["--sdk", "macosx", "--show-sdk-path"]);
        let target = std::env::var("TARGET").unwrap_or_default();
        let swift_target = if target.starts_with("x86_64") {
            "x86_64-apple-macos11"
        } else {
            "arm64-apple-macos11"
        };

        let sources: Vec<PathBuf> = SWIFT_SOURCES.iter().map(|s| swift_dir.join(s)).collect();
        for src in &sources {
            println!("cargo:rerun-if-changed={}", src.display());
        }
        println!("cargo:rerun-if-changed=build.rs");

        let mut cmd = Command::new("swiftc");
        cmd.args([
            "-target",
            swift_target,
            "-sdk",
            &sdk_path,
            "-emit-library",
            "-static",
            "-parse-as-library",
            "-O",
            "-o",
        ]);
        cmd.arg(&lib_path);
        for src in &sources {
            cmd.arg(src);
        }
        let status = cmd
            .status()
            .expect("swiftc 未安装或不可执行；请确认 Xcode Command Line Tools 已安装");
        assert!(status.success(), "swiftc 编译 Swift bridge 失败");

        println!("cargo:rustc-link-search=native={}", out_dir.display());
        println!("cargo:rustc-link-lib=static={LIB_NAME}");

        // Swift 静态库引用的 compatibility shim（swiftCompatibility56 等）位于 toolchain 的
        // swift_static/macosx；这条 search path 是 swiftc 在标准 -emit-library -static 流程
        // 中默认引用的，但 rustc 不会自动注入，必须显式声明。
        let swiftc_path = run_capture("xcrun", &["--find", "swiftc"]);
        // .../XcodeDefault.xctoolchain/usr/bin/swiftc → .../XcodeDefault.xctoolchain/usr
        let toolchain_usr = PathBuf::from(&swiftc_path)
            .parent() // bin
            .and_then(|p| p.parent()) // usr
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("/usr"));
        let swift_compat_dir = toolchain_usr.join("lib/swift/macosx");
        println!("cargo:rustc-link-search=native={}", swift_compat_dir.display());

        // Swift 运行时位于系统目录；运行期通过 @rpath 解析到 /usr/lib/swift
        let swift_lib_dir = format!("{sdk_path}/usr/lib/swift");
        println!("cargo:rustc-link-search=native={swift_lib_dir}");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        for fw in FRAMEWORKS {
            println!("cargo:rustc-link-lib=framework={fw}");
        }
    }

    fn run_capture(prog: &str, args: &[&str]) -> String {
        let output = Command::new(prog)
            .args(args)
            .output()
            .unwrap_or_else(|e| panic!("{prog} 调用失败: {e}"));
        assert!(
            output.status.success(),
            "{prog} {args:?} 退出码非零: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("命令输出非 UTF-8")
            .trim()
            .to_string()
    }
}
