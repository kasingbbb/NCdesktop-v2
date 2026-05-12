//! task_006 T4：工作区文件夹管理集成测试（PRD §6.2）
//!
//! 覆盖：
//! - `test_rename_db_path_sync`：rename 后物理子树与 DB file_path 前缀同步替换
//! - `test_round_trip_root_to_folder_to_root`：asset 从根 → 子目录 → 根的双向一致性
//!
//! 真实 SQLite + tempfile 工作区；通过覆盖 `HOME` 让 `dirs_next::download_dir`
//! 解析到 tempdir，避免操作真实 `~/Downloads/NoteCaptWorkPlace`。
//!
//! HOME 是进程级状态；多个 `#[test]` 默认并行，需要 static Mutex 串行。
//! `cargo test --test workspace_folders_integration -- --test-threads=1` 仍能通过。

use app_lib::commands::workspace_folders::{
    count_folder_assets_impl, move_asset_to_workspace_folder_impl,
    rename_workspace_folder_impl,
};
use app_lib::db::Database;
use app_lib::models::{Asset, Library, Project};
use app_lib::utils::write_guard::WorkspaceWriteGuard;
use app_lib::workspace;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// HOME sandbox：进程级状态，全局串行
fn with_sandboxed_home<F: FnOnce(&Path)>(f: F) {
    static HOME_LOCK: Mutex<()> = Mutex::new(());
    let _g = match HOME_LOCK.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let td = tempfile::tempdir().unwrap();
    let prev = std::env::var_os("HOME");
    std::fs::create_dir_all(td.path().join("Downloads")).unwrap();
    unsafe {
        std::env::set_var("HOME", td.path());
    }
    f(td.path());
    unsafe {
        match prev {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
    }
}

/// 在 HOME sandbox 的 tempdir 内创建 db（保证 db 文件与 HOME 同周期，避免跨 tempdir
/// 析构 race 造成 SQLite WAL 副文件失踪）。
fn make_db_in(home: &Path) -> Database {
    let db_dir = home.join("db");
    std::fs::create_dir_all(&db_dir).unwrap();
    let path = db_dir.join("test.db");
    Database::open(&path).expect("open db")
}

fn insert_test_project(db: &Database, project_id: &str) {
    let conn = db.conn.lock().unwrap();
    let lib = Library {
        id: format!("lib-{project_id}"),
        name: "测试库".into(),
        root_path: String::new(),
        created_at: "2026-05-11T00:00:00Z".into(),
    };
    app_lib::db::library::insert(&conn, &lib).unwrap();
    let proj = Project {
        id: project_id.into(),
        library_id: lib.id,
        name: "测试项目".into(),
        description: String::new(),
        cover_asset_id: None,
        source_type: "test".into(),
        source_data: None,
        is_pinned: false,
        is_archived: false,
        created_at: "2026-05-11T00:00:00Z".into(),
        updated_at: "2026-05-11T00:00:00Z".into(),
        total_duration: None,
        asset_count: 0,
        word_count: 0,
        imported_at: None,
    };
    app_lib::db::project::insert(&conn, &proj).unwrap();
}

fn insert_asset(db: &Database, id: &str, project_id: &str, abs_path: &str) {
    let conn = db.conn.lock().unwrap();
    let a = Asset {
        id: id.into(),
        project_id: project_id.into(),
        asset_type: "pdf".into(),
        name: PathBuf::from(abs_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
        original_name: "x.pdf".into(),
        file_path: abs_path.into(),
        file_size: 1,
        mime_type: "application/pdf".into(),
        captured_at: "2026-05-11T00:00:00Z".into(),
        imported_at: "2026-05-11T00:00:00Z".into(),
        source_type: "test".into(),
        source_data: None,
        is_starred: false,
        source_asset_id: None,
        derivative_version: 0,
    };
    app_lib::db::asset::insert(&conn, &a).unwrap();
}

/// AC-1：rename 后物理目录改名 + DB 子树前缀替换 + 同级邻居 file_path 未变。
/// 用 `foo` 与 `foo_neighbor` 同级；rename `foo → bar`，断言 foo 子树全部 rebase 到 bar，
/// foo_neighbor 子树 file_path 完全不动。
#[test]
fn test_rename_db_path_sync() {
    with_sandboxed_home(|home| {
        let guard = WorkspaceWriteGuard::new();
        let db = make_db_in(home);
        insert_test_project(&db, "p1");

        let root = workspace::project_workspace_dir("p1").unwrap();
        std::fs::create_dir_all(&root).unwrap();
        // 同级两目录：foo（被改名）/ foo_neighbor（不受影响）
        std::fs::create_dir_all(root.join("foo")).unwrap();
        std::fs::create_dir_all(root.join("foo_neighbor")).unwrap();

        // foo 下 3 个文件；foo_neighbor 下 2 个文件
        for name in ["a.pdf", "b.pdf", "c.pdf"] {
            std::fs::write(root.join("foo").join(name), b"x").unwrap();
        }
        for name in ["n1.pdf", "n2.pdf"] {
            std::fs::write(root.join("foo_neighbor").join(name), b"x").unwrap();
        }

        // 用 canonicalize 后绝对路径写入 DB（与命令内 validate_and_canonicalize 输出一致）
        let root_canon = root.canonicalize().unwrap();
        let foo_canon = root_canon.join("foo");
        let neighbor_canon = root_canon.join("foo_neighbor");

        insert_asset(&db, "a1", "p1", foo_canon.join("a.pdf").to_str().unwrap());
        insert_asset(&db, "a2", "p1", foo_canon.join("b.pdf").to_str().unwrap());
        insert_asset(&db, "a3", "p1", foo_canon.join("c.pdf").to_str().unwrap());
        insert_asset(&db, "n1", "p1", neighbor_canon.join("n1.pdf").to_str().unwrap());
        insert_asset(&db, "n2", "p1", neighbor_canon.join("n2.pdf").to_str().unwrap());

        // 执行 rename
        rename_workspace_folder_impl(&db, &guard, "p1", "foo", "bar").expect("rename ok");

        // 断言 (a) 物理：foo 不存在，bar 存在，文件全在 bar/ 下
        assert!(!root.join("foo").exists(), "rename 后 foo 不应存在");
        assert!(root.join("bar").exists(), "rename 后 bar 应存在");
        for name in ["a.pdf", "b.pdf", "c.pdf"] {
            assert!(root.join("bar").join(name).exists(), "{name} 应被搬到 bar/");
        }

        // 断言 (b) DB：a1/a2/a3 的 file_path 前缀全部从 foo → bar
        let conn = db.conn.lock().unwrap();
        let bar_canon = root_canon.join("bar");
        for id in ["a1", "a2", "a3"] {
            let a = app_lib::db::asset::get_by_id(&conn, id).unwrap().unwrap();
            assert!(
                a.file_path.starts_with(bar_canon.to_str().unwrap()),
                "{id} file_path 应以 bar canonical 前缀开头：{}",
                a.file_path
            );
            assert!(
                !a.file_path.contains("/foo/"),
                "{id} file_path 不应残留旧前缀 /foo/：{}",
                a.file_path
            );
        }

        // 断言 (c) 邻居 foo_neighbor 完全未受影响：file_path 与原始一致
        for id in ["n1", "n2"] {
            let a = app_lib::db::asset::get_by_id(&conn, id).unwrap().unwrap();
            assert!(
                a.file_path.contains("/foo_neighbor/"),
                "{id} 邻居子树 file_path 不应被误改：{}",
                a.file_path
            );
        }

        // 受影响行数 = bar/ 子树 asset 数 = 3（用 count_folder_assets 验证）
        drop(conn); // count_folder_assets 内会再次 lock
        let n_bar = count_folder_assets_impl(&db, "p1", "bar").expect("count bar");
        assert_eq!(n_bar, 3, "bar 子树 asset 数应为 3");
        let n_neighbor = count_folder_assets_impl(&db, "p1", "foo_neighbor")
            .expect("count neighbor");
        assert_eq!(n_neighbor, 2, "foo_neighbor 子树 asset 数应为 2");
    });
}

/// AC-2：asset 从根 → 子目录 → 回根 双向一致性
/// - 根放 1 个 asset；DB file_path = `<workspace>/x.pdf`
/// - create archive 目录
/// - move 到 `archive` → 物理迁移 + DB 更新
/// - move 回 `__ROOT__` → 物理回根 + DB 回根
/// - 全程 file_path 不含 `__ROOT__` 字面量
#[test]
fn test_round_trip_root_to_folder_to_root() {
    with_sandboxed_home(|home| {
        let guard = WorkspaceWriteGuard::new();
        let db = make_db_in(home);
        insert_test_project(&db, "p2");

        let root = workspace::project_workspace_dir("p2").unwrap();
        std::fs::create_dir_all(&root).unwrap();
        // 创建 archive 目录（避免依赖 create 命令）
        std::fs::create_dir_all(root.join("archive")).unwrap();

        // 根上 1 个文件
        let root_canon = root.canonicalize().unwrap();
        let initial_file = root_canon.join("x.pdf");
        std::fs::write(&initial_file, b"hello").unwrap();
        insert_asset(&db, "ax", "p2", initial_file.to_str().unwrap());

        // round 1: root → archive
        // DEBUG inline 复现：精确复刻 move_impl 顺序，输出每步状态
        {
            let asset_pre = {
                let conn = db.conn.lock().unwrap();
                app_lib::db::asset::get_by_id(&conn, "ax").unwrap().unwrap()
            };
            eprintln!("INLINE asset.file_path = {}", asset_pre.file_path);
            let target_dir = app_lib::workspace::validate_and_canonicalize("p2", "archive").unwrap();
            eprintln!("INLINE target_dir = {}", target_dir.display());
            let src = std::path::PathBuf::from(&asset_pre.file_path);
            let file_name = src.file_name().unwrap();
            let dst = target_dir.join(file_name);
            eprintln!("INLINE src = {} exists={}", src.display(), src.exists());
            eprintln!("INLINE dst = {}", dst.display());
            let mut conn = db.conn.lock().unwrap();
            let tx = conn.unchecked_transaction().unwrap();
            let rn = std::fs::rename(&src, &dst);
            eprintln!("INLINE rename = {:?}", rn);
            let new_path_str = dst.to_string_lossy().to_string();
            let new_name_str = "x.pdf".to_string();
            let r = tx.execute(
                "UPDATE assets SET name = :name, file_path = :fp WHERE id = :id",
                rusqlite::named_params! {
                    ":name": new_name_str,
                    ":fp": new_path_str,
                    ":id": "ax",
                },
            );
            eprintln!("INLINE UPDATE = {:?}", r);
            tx.commit().unwrap();
            // 把 fs 还原以便随后真正调用 move_impl
            std::fs::rename(&dst, &src).unwrap();
            let conn = db.conn.lock().unwrap();
            conn.execute("UPDATE assets SET file_path = ?1 WHERE id = 'ax'", rusqlite::params![asset_pre.file_path]).unwrap();
        }
        move_asset_to_workspace_folder_impl(&db, &guard, "ax", "archive").expect("move to archive");

        let after_in_dir = root_canon.join("archive").join("x.pdf");
        assert!(after_in_dir.exists(), "x.pdf 应已在 archive/ 内");
        assert!(!initial_file.exists(), "x.pdf 不应仍在根");

        {
            let conn = db.conn.lock().unwrap();
            let a = app_lib::db::asset::get_by_id(&conn, "ax").unwrap().unwrap();
            assert_eq!(a.file_path, after_in_dir.to_str().unwrap());
            assert!(!a.file_path.contains("__ROOT__"), "file_path 永不含 __ROOT__");
        }

        // round 2: archive → __ROOT__
        move_asset_to_workspace_folder_impl(&db, &guard, "ax", "__ROOT__").expect("move back to root");

        let back_in_root = root_canon.join("x.pdf");
        assert!(back_in_root.exists(), "x.pdf 应回到根目录");
        assert!(!after_in_dir.exists(), "x.pdf 不应仍在 archive/");

        {
            let conn = db.conn.lock().unwrap();
            let a = app_lib::db::asset::get_by_id(&conn, "ax").unwrap().unwrap();
            assert_eq!(a.file_path, back_in_root.to_str().unwrap());
            assert!(!a.file_path.contains("__ROOT__"), "file_path 永不含 __ROOT__");
        }

        // count 验证：__ROOT__ 计 1（根级裸文件），archive 计 0
        let n_root = count_folder_assets_impl(&db, "p2", "__ROOT__").expect("count root");
        assert_eq!(n_root, 1, "round-trip 后根级裸文件数应为 1");
        let n_archive = count_folder_assets_impl(&db, "p2", "archive").expect("count archive");
        assert_eq!(n_archive, 0, "archive 应为空");
    });
}
