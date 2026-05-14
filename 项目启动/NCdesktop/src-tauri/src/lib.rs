/// NoteCapt Desktop — 多模态知识采集终端的桌面控制中枢

pub mod models;
pub mod db;
pub mod commands;
pub mod sync;
pub mod audio;
pub mod llm;
pub mod workspace;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod extraction;
pub mod source_scan;
// task_008（M-1 关闭）：scheduler::write_derivative_md 通过 crate::utils::safe_name
// 引用 sanitize_stem。utils 目录中的文件早已存在但 lib.rs 未注册，与 scheduler
// 自身被注释属同一类"注册缺口"。
pub mod utils;

/// 自动化测试专用：初始化日志、统一 `[TEST]` 前缀（仅 `cargo test` 编译）
#[cfg(test)]
pub mod testing;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取应用数据目录");
            let db_path = app_data_dir.join("notecapt.db");
            let database = Database::open(&db_path)
                .expect("数据库初始化失败");

            app.manage(database);

            // task_011 FIX BLOCKER：PipelineScheduler 须在 setup 阶段 manage，
            // 否则 `app.state::<PipelineScheduler>()`（如 retrigger_extraction:111）
            // 在运行时会 panic（Tauri Manager::state 在 T 未注册时直接 panic）。
            app.manage(extraction::scheduler::PipelineScheduler::new());

            // task_007 / ADR-010：启动期一次性 runtime-manifest 自检。
            // 读 Resources/runtime-manifest.json + 7 imports 探测 → 缓存到 AppState。
            // 自检失败不 panic（保护离线开发态 / 未生成 manifest 的 dev 启动）；
            // 失败码缓存供 UI banner 与后续 markitdown/scheduler 路由前短路消费。
            let runtime_check_result = extraction::runtime_check::verify_runtime_manifest(app.handle());
            match &runtime_check_result {
                Ok(m) => log::info!(
                    "runtime self-check PASS: runtime_id={} markitdown={} imports={}",
                    m.runtime_id,
                    m.markitdown.version,
                    m.imports.len()
                ),
                Err(code) => log::warn!(
                    "runtime self-check FAIL: code={} （UI 应禁用所有转录入口）",
                    code
                ),
            }
            app.manage(extraction::runtime_check::RuntimeCheckState::new(
                runtime_check_result,
            ));

            // Boot-time 恢复：scheduler 采用懒启动，但若 DB 中有上次进程留下的
            // queued/running 任务（崩溃或正常退出后未处理完），必须在启动时
            // 唤醒一次，否则这些任务将永远停留在 queued。
            //   1) running → queued（崩溃恢复）
            //   2) 若仍有 queued 任务，触发一次 scheduler.start()
            let needs_wake = {
                let db = app.state::<Database>();
                let lock_result = db.conn.lock();
                match lock_result {
                    Ok(conn) => {
                        if let Err(e) = db::extraction::reset_running_tasks(&conn) {
                            log::warn!("启动期重置 running 任务失败: {}", e);
                        }
                        match db::extraction::get_pipeline_stats(&conn) {
                            Ok(stats) => stats.queued > 0,
                            Err(e) => {
                                log::warn!("启动期查询管线统计失败: {}", e);
                                false
                            }
                        }
                    }
                    Err(_) => false,
                }
            };
            if needs_wake {
                let app_handle = app.handle().clone();
                log::info!("启动期检测到 queued 任务，唤醒调度循环");
                // setup() 同步上下文里 tokio runtime 尚未绑定为线程局部默认，直接调用
                // scheduler.start() 内部的 tokio::spawn 会 panic（no reactor）。
                // 通过 tauri::async_runtime::spawn 进入受管 runtime 再启动调度循环。
                tauri::async_runtime::spawn(async move {
                    let scheduler =
                        app_handle.state::<extraction::scheduler::PipelineScheduler>();
                    scheduler.start(app_handle.clone());
                });
            }

            // task_007 / ADR-004：注册 SourceMissingSet 内存态，并异步扫描所有
            // root assets 的 source 是否存在；扫描在 tauri::async_runtime 内进行，
            // 绝不阻塞 setup hook。失败仅 warn。
            app.manage(source_scan::SourceMissingSet::new());
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = source_scan::scan_all_projects(&app_handle) {
                        log::warn!("[source_scan] 启动期扫描失败: {e}");
                    }
                });
            }

            log::info!("NoteCapt 数据库已初始化: {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // W1-A: 核心 CRUD
            commands::library::get_libraries,
            commands::library::create_library,
            commands::library::update_library,
            commands::library::delete_library,
            commands::project::get_projects,
            commands::project::get_project,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::asset::get_assets,
            commands::asset::get_project_asset_tag_map,
            commands::asset::get_assets_by_tag,
            commands::asset::get_asset,
            commands::asset::create_asset,
            commands::asset::update_asset,
            commands::asset::rename_asset,
            commands::asset::delete_asset,
            commands::asset::toggle_asset_star,
            commands::asset::get_asset_analysis,
            commands::asset::move_asset_to_workspace_folder,
            commands::asset::move_assets,
            commands::asset::copy_assets,
            commands::asset::get_drag_icon_path,
            commands::timeline::get_timeline,
            commands::timeline::create_timeline,
            commands::timeline::get_audio_tracks,
            commands::timeline::create_audio_track,
            commands::timeline::get_keyframes,
            commands::timeline::create_keyframe,
            commands::timeline::delete_keyframe,
            commands::timeline::get_markers,
            commands::timeline::create_marker,
            commands::timeline::delete_marker,
            commands::tag::get_tags,
            commands::tag::create_tag,
            commands::tag::delete_tag,
            commands::tag::link_tag_to_asset,
            commands::tag::unlink_tag_from_asset,
            commands::tag::ensure_asset_tag_by_name,
            commands::tag::get_asset_tags,
            commands::note::get_notes,
            commands::note::get_note,
            commands::note::create_note,
            commands::note::update_note,
            commands::note::delete_note,
            commands::search::search,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            // W2: 同步引擎 + 音频处理
            commands::sync::scan_tf_card,
            commands::sync::preview_import,
            commands::sync::import_sessions,
            commands::sync::get_sync_status,
            commands::audio::get_audio_metadata,
            commands::audio::get_waveform_data,
            // W2: 悬浮窗
            commands::dropzone::create_dropzone_window,
            commands::dropzone::close_dropzone_window,
            commands::dropzone::toggle_dropzone_window,
            commands::dropzone::import_drop_paths,
            // W4: LLM Bridge + 导出
            commands::export::export_project_markdown,
            commands::export::copy_to_clipboard,
            commands::llm::get_llm_config,
            commands::llm::save_llm_config,
            commands::llm::llm_summarize,
            commands::llm::llm_classify,
            commands::llm::llm_probe,
            commands::llm::llm_enhance_export,
            commands::workspace_folders::get_project_workspace_root,
            commands::workspace_folders::list_project_workspace_folders,
            commands::workspace_folders::reveal_project_workspace_folder,
            commands::knowledge_understanding::knowledge_get_understanding_data,
            commands::knowledge_understanding::knowledge_generate_summary,
            commands::knowledge_understanding::knowledge_generate_explanation,
            commands::knowledge_understanding::knowledge_validate_explanation,
            commands::knowledge_understanding::knowledge_save_user_note,
            commands::knowledge_understanding::knowledge_get_relations,
            commands::knowledge::knowledge_compute_co_occurrence,
            commands::conversion::check_markitdown_status,
            commands::conversion::convert_asset_to_markdown,
            commands::conversion::get_conversion_meta,
            commands::extraction::retrigger_extraction,
            commands::extraction::retry_asset_conversion,
            commands::outbound::prepare_outbound_payload,
            commands::source_view::reveal_source_file,
            #[cfg(debug_assertions)]
            source_scan::source_scan_get_missing,
        ])
        .run(tauri::generate_context!())
        .expect("NoteCapt 启动失败");
}

use tauri::Manager;
