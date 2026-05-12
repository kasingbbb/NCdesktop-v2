use tauri::{command, AppHandle, Manager};
use crate::db::Database;
use crate::db::extraction as db_ext;
use crate::extraction::scheduler::PipelineScheduler;

#[command]
pub async fn extract_asset(app: AppHandle, asset_id: String) -> Result<String, String> {
    let task_id = PipelineScheduler::enqueue(&app, &asset_id)?;
    let scheduler = app.state::<PipelineScheduler>();
    scheduler.start(app.clone());
    Ok(task_id)
}

#[command]
pub async fn extract_project_assets(app: AppHandle, project_id: String) -> Result<String, String> {
    let asset_ids: Vec<String> = {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
        let assets = crate::db::asset::get_by_project(&conn, &project_id)?;
        assets.into_iter().map(|a| a.id).collect()
    };

    let batch_id = PipelineScheduler::enqueue_batch(&app, &asset_ids)?;
    let scheduler = app.state::<PipelineScheduler>();
    scheduler.start(app.clone());
    Ok(batch_id)
}

#[command]
pub async fn get_extraction_status(app: AppHandle, asset_id: String) -> Result<Option<db_ext::ExtractedContentRow>, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
    db_ext::get_extracted_content(&conn, &asset_id)
}

#[command]
pub async fn get_extracted_content(app: AppHandle, asset_id: String) -> Result<Option<db_ext::ExtractedContentRow>, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
    db_ext::get_extracted_content(&conn, &asset_id)
}

#[command]
pub async fn retry_extraction(app: AppHandle, asset_id: String) -> Result<String, String> {
    {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
        db_ext::update_extraction_status(&conn, &asset_id, "pending", None)?;
    }
    extract_asset(app, asset_id).await
}

#[command]
pub async fn get_pipeline_progress(app: AppHandle) -> Result<db_ext::PipelineStats, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
    db_ext::get_pipeline_stats(&conn)
}
