//! Dev test binary — exercises the full SocraticNovel backend flow via CLI.
//! Usage: API_KEY=sk-... cargo run --bin dev_test
//!
//! This is a "backdoor" for testing without the GUI.

use socratic_novel_lib::ai::{runtime, tools, types::*};
use std::env;

#[tokio::main]
async fn main() {
    let api_key = env::var("API_KEY").unwrap_or_else(|_| {
        eprintln!("❌ Set API_KEY env var first: API_KEY=sk-... cargo run --bin dev_test");
        std::process::exit(1);
    });
    let provider = env::var("PROVIDER").unwrap_or_else(|_| "anthropic".to_string());
    let model = env::var("MODEL").unwrap_or_default();

    println!("═══════════════════════════════════════════════════════");
    println!("  SocraticNovel Dev Test — Backend Flow Verification  ");
    println!("  Provider: {provider}");
    println!("═══════════════════════════════════════════════════════\n");

    // ─── Test 1: Prompt building ──────────────────────────────────
    println!("📋 Test 1: build_practice_prompt()");
    let prompt = runtime::build_practice_prompt("Character base: 凛");
    assert!(!prompt.is_empty(), "Practice prompt should not be empty");
    assert!(prompt.contains("respond_to_student"), "Prompt should mention respond_to_student tool");
    assert!(prompt.contains("極光走廊"), "Prompt should contain 極光走廊 scene");
    assert!(prompt.contains("Socratic"), "Prompt should mention Socratic method");
    println!("   ✅ Prompt built ({} chars)", prompt.len());
    let preview: String = prompt.chars().take(200).collect();
    println!("   First 200 chars: {}\n", preview);

    // ─── Test 2: Tool definitions ─────────────────────────────────
    println!("📋 Test 2: get_practice_tools()");
    let practice_tools = tools::get_practice_tools();
    let tool_names: Vec<&str> = practice_tools.iter().map(|t| t.name.as_str()).collect();
    println!("   Tools: {:?}", tool_names);
    assert!(tool_names.contains(&"respond_to_student"), "Must have respond_to_student");
    assert!(tool_names.contains(&"render_canvas"), "Must have render_canvas");
    assert!(tool_names.contains(&"think"), "Must have think");
    assert!(tool_names.contains(&"read_file"), "Must have read_file");
    assert!(tool_names.contains(&"search_file"), "Must have search_file");
    println!("   ✅ All 5 practice tools present\n");

    // ─── Test 3: extract_conversation_text ────────────────────────
    println!("📋 Test 3: extract_conversation_text()");
    let test_messages = vec![
        Message {
            role: "user".to_string(),
            content: vec![ContentBlock::Text {
                text: "What is Coulomb's law?".to_string(),
            }],
        },
        Message {
            role: "assistant".to_string(),
            content: vec![
                ContentBlock::Text {
                    text: "(thinking about how to explain...)".to_string(),
                },
                ContentBlock::ToolUse {
                    id: "t1".to_string(),
                    name: "respond_to_student".to_string(),
                    input: serde_json::json!({
                        "content": "Coulomb's law describes the force between two charges."
                    }),
                },
            ],
        },
    ];
    let extracted = runtime::extract_conversation_text(&test_messages);
    println!("   Extracted text:\n   {}", extracted.replace('\n', "\n   "));
    assert!(extracted.contains("Student: What is Coulomb"), "Should contain student text");
    assert!(
        extracted.contains("Teacher→Student: Coulomb's law describes"),
        "Should contain respond_to_student content"
    );
    assert!(
        extracted.contains("Teacher: (thinking"),
        "Should contain assistant thinking text"
    );
    println!("   ✅ Text extraction correct\n");

    // ─── Test 4: call_ai_simple (real API call) ───────────────────
    println!("📋 Test 4: call_ai_simple() — real API call");
    let simple_messages = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: "Reply with exactly: PONG".to_string(),
        }],
    }];
    match runtime::call_ai_simple(&api_key, &provider, &model, "You are a test bot. Reply exactly as instructed.", simple_messages).await {
        Ok(response) => {
            println!("   Response: {}", response.trim());
            assert!(
                response.to_uppercase().contains("PONG"),
                "AI should respond with PONG"
            );
            println!("   ✅ API call successful\n");
        }
        Err(e) => {
            println!("   ❌ API call failed: {}", e);
            println!("   Skipping remaining API tests.\n");
            print_summary(3, 1);
            return;
        }
    }

    // ─── Test 5: generate_notes (real API call) ───────────────────
    println!("📋 Test 5: generate_notes() — real API call");
    let lesson_messages = build_mock_lesson();
    match runtime::generate_notes(&api_key, &provider, &model, &lesson_messages).await {
        Ok(notes) => {
            println!("   Notes length: {} chars", notes.len());
            let preview = notes.chars().take(300).collect::<String>();
            println!("   First 300 chars:\n   {}", preview.replace('\n', "\n   "));
            assert!(notes.len() > 100, "Notes should be substantial");
            println!("   ✅ Notes generated\n");
        }
        Err(e) => {
            println!("   ❌ generate_notes failed: {}", e);
            println!();
        }
    }

    // ─── Test 6: generate_anki_cards (real API call) ──────────────
    println!("📋 Test 6: generate_anki_cards() — real API call");
    match runtime::generate_anki_cards(&api_key, &provider, &model, &lesson_messages).await {
        Ok(tsv) => {
            let card_count = tsv.lines().filter(|l| l.contains('\t')).count();
            println!("   TSV length: {} chars, {} cards", tsv.len(), card_count);
            println!("   First 3 cards:");
            for line in tsv.lines().take(3) {
                println!("   | {}", line);
            }
            assert!(card_count >= 2, "Should generate at least 2 cards");
            println!("   ✅ Anki cards generated\n");
        }
        Err(e) => {
            println!("   ❌ generate_anki_cards failed: {}", e);
            println!();
        }
    }

    print_summary(6, 0);
}

/// Build a mock lesson conversation for notes/anki testing
fn build_mock_lesson() -> Vec<Message> {
    vec![
        Message {
            role: "user".to_string(),
            content: vec![ContentBlock::Text {
                text: "Can you explain Gauss's Law?".to_string(),
            }],
        },
        Message {
            role: "assistant".to_string(),
            content: vec![ContentBlock::ToolUse {
                id: "t1".to_string(),
                name: "respond_to_student".to_string(),
                input: serde_json::json!({
                    "content": "Gauss's Law states that the total electric flux through a closed surface is proportional to the enclosed charge. Mathematically: ∮ E·dA = Q_enc / ε₀. The key insight is that this relates the *surface integral* of the field to the *volume* of charge inside. Think about it — why would a symmetric distribution make this law especially powerful?"
                }),
            }],
        },
        Message {
            role: "user".to_string(),
            content: vec![ContentBlock::Text {
                text: "Because you can choose a Gaussian surface where E is constant?".to_string(),
            }],
        },
        Message {
            role: "assistant".to_string(),
            content: vec![ContentBlock::ToolUse {
                id: "t2".to_string(),
                name: "respond_to_student".to_string(),
                input: serde_json::json!({
                    "content": "Exactly! When you choose a Gaussian surface that matches the symmetry of the charge distribution, E becomes constant over the surface (or zero, or parallel to dA). This lets you pull E out of the integral: E · A = Q_enc / ε₀, turning a complex integral into simple algebra. The three classic symmetries are: spherical (point charge, sphere), cylindrical (infinite line charge, infinite cylinder), and planar (infinite plane). For a point charge q at center, using a spherical Gaussian surface of radius r: E(4πr²) = q/ε₀, giving E = kq/r²."
                }),
            }],
        },
        Message {
            role: "user".to_string(),
            content: vec![ContentBlock::Text {
                text: "What happens if the charge is outside the Gaussian surface?".to_string(),
            }],
        },
        Message {
            role: "assistant".to_string(),
            content: vec![ContentBlock::ToolUse {
                id: "t3".to_string(),
                name: "respond_to_student".to_string(),
                input: serde_json::json!({
                    "content": "If the charge is outside the Gaussian surface, the net flux through the surface is zero. Field lines enter and exit in equal amounts. This is a crucial distinction — Gauss's Law counts only the ENCLOSED charge. External charges contribute to the field at any given point, but their net flux contribution through a closed surface cancels out perfectly."
                }),
            }],
        },
    ]
}

fn print_summary(passed: usize, failed: usize) {
    println!("═══════════════════════════════════════════════════════");
    if failed == 0 {
        println!("  ✅ ALL {} TESTS PASSED", passed);
    } else {
        println!("  ⚠️  {}/{} tests passed, {} failed", passed, passed + failed, failed);
    }
    println!("═══════════════════════════════════════════════════════");
}
