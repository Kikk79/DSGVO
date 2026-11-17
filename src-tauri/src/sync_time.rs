#![allow(dead_code)]
//! Uhr mit Versatz zur Serverzeit.

use anyhow::{anyhow, Result};
use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, SubsecRound, Utc};
use std::sync::atomic::{AtomicI64, Ordering};

/// Lokale Uhr plus Versatz zur Serverzeit (in Millisekunden).
pub struct SyncClock {
    offset_ms: AtomicI64,
}

impl SyncClock {
    pub fn new(offset_ms: i64) -> Self {
        Self {
            offset_ms: AtomicI64::new(offset_ms),
        }
    }

    /// Aktuelle Serverzeit (lokale Uhr + Versatz), auf Millisekunden gekuerzt.
    pub fn now(&self) -> DateTime<Utc> {
        (Utc::now() + Duration::milliseconds(self.offset_ms())).trunc_subsecs(3)
    }

    pub fn offset_ms(&self) -> i64 {
        self.offset_ms.load(Ordering::Relaxed)
    }

    pub fn set_offset_ms(&self, ms: i64) {
        self.offset_ms.store(ms, Ordering::Relaxed);
    }
}

/// Versatz (ms) = Server-Datum minus Mittelpunkt von `sent_local`..`received_local`.
pub fn offset_from_date_header(
    date_header: &str,
    sent_local: DateTime<Utc>,
    received_local: DateTime<Utc>,
) -> Option<i64> {
    let trimmed = date_header.trim();
    let normalized = match trimmed.strip_suffix("GMT") {
        Some(rest) => format!("{}+0000", rest),
        None => trimmed.to_string(),
    };
    let server = DateTime::parse_from_rfc2822(&normalized)
        .ok()?
        .with_timezone(&Utc);
    let half = (received_local - sent_local).num_milliseconds() / 2;
    let midpoint = sent_local + Duration::milliseconds(half);
    Some((server - midpoint).num_milliseconds())
}

/// RFC 3339 mit Millisekunden und `Z`.
pub fn format_ts(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Akzeptiert RFC 3339 und `YYYY-MM-DD HH:MM:SS[.fff]` (als UTC).
pub fn parse_ts(s: &str) -> Result<DateTime<Utc>> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }
    NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f")
        .map(|n| n.and_utc())
        .map_err(|e| anyhow!("Ungueltiger Zeitstempel '{}': {}", s, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    #[test]
    fn test_offset_from_date_header_uses_midpoint() {
        let r = offset_from_date_header(
            "Tue, 17 Nov 2026 10:00:10 GMT",
            ts("2026-11-17T10:00:00.000Z"),
            ts("2026-11-17T10:00:02.000Z"),
        );
        assert_eq!(r, Some(9_000));
    }

    #[test]
    fn test_offset_from_date_header_rejects_garbage() {
        let t = ts("2026-11-17T10:00:00.000Z");
        assert_eq!(offset_from_date_header("kaputt", t, t), None);
    }

    #[test]
    fn test_clock_now_applies_offset() {
        let d = SyncClock::new(60_000).now() - Utc::now();
        assert!(d.num_milliseconds() >= 59_000 && d.num_milliseconds() <= 61_000);
    }

    #[test]
    fn test_parse_ts_accepts_both_formats() {
        let a = parse_ts("2026-11-17 08:00:00").unwrap();
        let b = parse_ts("2026-11-17T08:00:00.000Z").unwrap();
        assert_eq!(a, b);
        assert_eq!(parse_ts("2026-11-17 08:00:00.250").unwrap().timestamp_subsec_millis(), 250);
    }

    #[test]
    fn test_format_ts_roundtrip() {
        let t = ts("2026-11-17T08:00:00.123Z");
        assert_eq!(format_ts(t), "2026-11-17T08:00:00.123Z");
        assert_eq!(parse_ts(&format_ts(t)).unwrap(), t);
    }
}
