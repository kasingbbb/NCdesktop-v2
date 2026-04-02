/// NoteCapt Desktop — 多模态知识采集终端的桌面控制中枢

pub mod models;
pub mod db;
pub mod commands;
pub mod sync;
pub mod audio;
pub mod llm;
pub mod workspace;

/// 自动化测试专用：初始化日志、统一 `[TEST]` 前缀（仅 `cargo test` 编译）
#[cfg(test)]
pub mod testing;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            commands::asset::delete_asset,
            commands::asset::toggle_asset_star,
            commands::asset::get_asset_analysis,
            commands::asset::move_assets,
            commands::asset::copy_assets,
            commands::asset::get_file_content,
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
        ])
        .run(tauri::generate_context!())
        .expect("NoteCapt 启动失败");
}

use tauri::Manager;
