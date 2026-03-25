use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewCard {
    pub id: String,
    #[serde(rename = "knowledgePoint")]
    pub knowledge_point: String,
    #[serde(rename = "sourceChapter")]
    pub source_chapter: String,
    #[serde(rename = "cardType")]
    pub card_type: String, // "concept" | "compute"
    pub front: String,
    pub back: String,
    #[serde(rename = "addedDate")]
    pub added_date: String,
    #[serde(rename = "nextReviewDate")]
    pub next_review_date: String,
    #[serde(rename = "reviewCount")]
    pub review_count: u32,
    #[serde(rename = "easeFactor")]
    pub ease_factor: f64,
    pub status: String, // "active" | "mastered"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStats {
    #[serde(rename = "totalCards")]
    pub total_cards: usize,
    #[serde(rename = "dueToday")]
    pub due_today: usize,
    pub mastered: usize,
    #[serde(rename = "reviewedToday")]
    pub reviewed_today: usize,
}

#[derive(Debug, Deserialize)]
pub struct AddCardsPayload {
    #[serde(rename = "workspacePath")]
    pub workspace_path: String,
    pub cards: Vec<NewCard>,
}

#[derive(Debug, Deserialize)]
pub struct NewCard {
    #[serde(rename = "knowledgePoint")]
    pub knowledge_point: String,
    #[serde(rename = "sourceChapter")]
    pub source_chapter: String,
    #[serde(rename = "cardType")]
    pub card_type: String,
    pub front: String,
    pub back: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCardPayload {
    #[serde(rename = "workspacePath")]
    pub workspace_path: String,
    #[serde(rename = "cardId")]
    pub card_id: String,
    pub rating: u8, // 1=forgot, 2=hard, 3=recalled, 4=easy
}

// ─── File Path ───────────────────────────────────────────────────

const REVIEW_FILE: &str = "teacher/runtime/review_queue.json";

fn review_file_path(workspace_path: &str) -> PathBuf {
    PathBuf::from(workspace_path).join(REVIEW_FILE)
}

// ─── Persistence (JSON) ──────────────────────────────────────────

fn load_cards(workspace_path: &str) -> Vec<ReviewCard> {
    let path = review_file_path(workspace_path);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_cards(workspace_path: &str, cards: &[ReviewCard]) -> Result<(), String> {
    let path = review_file_path(workspace_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(cards)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write: {}", e))
}

// ─── SM-2 Scheduling ─────────────────────────────────────────────

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn add_days(date: &str, days: i64) -> String {
    use chrono::NaiveDate;
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());
    (d + chrono::Duration::days(days)).format("%Y-%m-%d").to_string()
}

/// Calculate next review date and new ease factor based on rating.
/// Rating: 1=forgot, 2=hard, 3=recalled, 4=easy
fn calculate_next_review(card: &ReviewCard, rating: u8) -> (String, f64, u32, String) {
    let today = today();
    let mut ease = card.ease_factor;
    let mut count = card.review_count + 1;
    let status;

    // Adjust ease factor (SM-2 inspired)
    match rating {
        1 => { ease = (ease - 0.3).max(1.3); }  // forgot → decrease ease
        2 => { ease = (ease - 0.1).max(1.3); }  // hard → slight decrease
        3 => { /* no change */ }                   // recalled → keep ease
        4 => { ease += 0.1; }                      // easy → increase ease
        _ => {}
    }

    if rating == 1 {
        // Forgot: reset to beginning
        count = 1;
        let next = add_days(&today, 1);
        status = "active".to_string();
        return (next, ease, count, status);
    }

    // Calculate interval based on review count
    let interval = match count {
        1 => 1,
        2 => 3,
        3 => 7,
        4 => 14,
        5 => 30,
        n => {
            // After 5 reviews, mark as mastered
            if n >= 6 {
                status = "mastered".to_string();
                return (add_days(&today, 90), ease, count, status);
            }
            (30.0 * ease) as i64
        }
    };

    // Apply ease factor to interval for ratings 2-4
    let adjusted = match rating {
        2 => (interval as f64 * 0.8) as i64, // hard → shorter interval
        4 => (interval as f64 * 1.3) as i64, // easy → longer interval
        _ => interval,
    };

    let next = add_days(&today, adjusted.max(1));
    status = "active".to_string();
    (next, ease, count, status)
}

// ─── Tauri Commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_review_queue(workspace_path: String) -> Result<Vec<ReviewCard>, String> {
    Ok(load_cards(&workspace_path))
}

#[tauri::command]
pub fn get_review_stats(workspace_path: String) -> Result<ReviewStats, String> {
    let cards = load_cards(&workspace_path);
    let today = today();
    let due = cards.iter().filter(|c| c.status == "active" && c.next_review_date <= today).count();
    let mastered = cards.iter().filter(|c| c.status == "mastered").count();
    Ok(ReviewStats {
        total_cards: cards.len(),
        due_today: due,
        mastered,
        reviewed_today: 0, // tracked in frontend
    })
}

#[tauri::command]
pub fn get_due_cards(workspace_path: String) -> Result<Vec<ReviewCard>, String> {
    let cards = load_cards(&workspace_path);
    let today = today();
    let due: Vec<ReviewCard> = cards
        .into_iter()
        .filter(|c| c.status == "active" && c.next_review_date <= today)
        .collect();
    Ok(due)
}

#[tauri::command]
pub fn update_review_card(payload: UpdateCardPayload) -> Result<ReviewCard, String> {
    let mut cards = load_cards(&payload.workspace_path);
    let card_idx = cards
        .iter()
        .position(|c| c.id == payload.card_id)
        .ok_or_else(|| format!("Card not found: {}", payload.card_id))?;

    let (next_date, ease, count, status) = calculate_next_review(&cards[card_idx], payload.rating);
    cards[card_idx].next_review_date = next_date;
    cards[card_idx].ease_factor = ease;
    cards[card_idx].review_count = count;
    cards[card_idx].status = status;

    let updated = cards[card_idx].clone();
    save_cards(&payload.workspace_path, &cards)?;
    Ok(updated)
}

#[tauri::command]
pub fn add_review_cards(payload: AddCardsPayload) -> Result<usize, String> {
    let mut cards = load_cards(&payload.workspace_path);
    let today = today();
    let count = payload.cards.len();

    for new_card in payload.cards {
        let id = format!("rc-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0000"));
        cards.push(ReviewCard {
            id,
            knowledge_point: new_card.knowledge_point,
            source_chapter: new_card.source_chapter,
            card_type: new_card.card_type,
            front: new_card.front,
            back: new_card.back,
            added_date: today.clone(),
            next_review_date: add_days(&today, 1), // first review tomorrow
            review_count: 0,
            ease_factor: 2.5,
            status: "active".to_string(),
        });
    }

    save_cards(&payload.workspace_path, &cards)?;
    Ok(count)
}
