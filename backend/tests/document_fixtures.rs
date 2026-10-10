use hima_api::planner::validate_document;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Fixture {
    name: String,
    document: Value,
}

#[test]
fn shared_document_validation_fixtures() {
    // Embed the same checked-in JSON read by the frontend, independent of cwd.
    for (source, accepted) in [
        (
            include_str!("../../fixtures/document-validation/valid.json"),
            true,
        ),
        (
            include_str!("../../fixtures/document-validation/invalid.json"),
            false,
        ),
    ] {
        let fixtures: Vec<Fixture> = serde_json::from_str(source).unwrap();
        assert!(!fixtures.is_empty());
        for fixture in fixtures {
            let result = validate_document(&fixture.document);
            assert_eq!(result.is_ok(), accepted, "{}: {result:?}", fixture.name);
        }
    }
}
