import { useState, useEffect } from "react";
import { getSectionReviews, createReview, updateReview, deleteReview } from "../services/api";

const TYPE_STYLES = {
  issue: { bg: "#FEF2F2", text: "#B91C1C", label: "Issue" },
  highlight: { bg: "#EFF6FF", text: "#2563EB", label: "Highlight" },
  redo: { bg: "#FEF9C3", text: "#CA8A04", label: "Redo" },
};

export default function SectionReviews({ sectionId, user }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reviewType, setReviewType] = useState("issue");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getSectionReviews(sectionId);
      setReviews(res.data);
    } catch (err) {
      console.error("Failed to load reviews", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sectionId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!notes.trim()) return;
    setSubmitting(true);
    try {
      await createReview(sectionId, {
        review_type: reviewType,
        notes,
        due_date: dueDate || null,
        raised_by: user?.user_id,
      });
      setNotes("");
      setDueDate("");
      setReviewType("issue");
      setShowForm(false);
      await load();
    } catch (err) {
      console.error("Failed to add review entry", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id) => {
    setBusyId(id);
    try {
      await updateReview(id, { status: "resolved", resolved_by: user?.user_id });
      await load();
    } catch (err) {
      console.error("Failed to resolve review", err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    try {
      await deleteReview(id);
      await load();
    } catch (err) {
      console.error("Failed to delete review", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Review Log
        </span>
        <button
          className="btn btn-secondary"
          style={{ padding: "4px 10px", fontSize: "11px" }}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "+ Add Entry"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "12px",
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            marginBottom: "12px",
            background: "#F9FAFB",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              value={reviewType}
              onChange={(e) => setReviewType(e.target.value)}
              style={{ flex: 1, fontSize: "12px" }}
            >
              <option value="issue">Issue</option>
              <option value="highlight">Highlight</option>
              <option value="redo">Redo request</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ flex: 1, fontSize: "12px" }}
              title="When work should be done"
            />
          </div>
          <textarea
            placeholder="Describe the issue, highlight, or what needs redoing…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ fontSize: "12px" }}
            required
          />
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "5px 14px", fontSize: "12px" }} disabled={submitting}>
            {submitting ? "Saving…" : "Save Entry"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: "12px", color: "#6B7280" }}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#6B7280" }}>No review entries yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {reviews.map((r) => {
            const style = TYPE_STYLES[r.review_type] || TYPE_STYLES.issue;
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  opacity: r.status === "resolved" ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: style.bg,
                      color: style.text,
                    }}
                  >
                    {style.label}
                  </span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {r.due_date && (
                      <span style={{ fontSize: "10px", color: "#6B7280" }}>Due {r.due_date}</span>
                    )}
                    <span style={{ fontSize: "10px", color: r.status === "resolved" ? "#16A34A" : "#CA8A04" }}>
                      {r.status}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: "12.5px", color: "#111827", margin: "0 0 6px" }}>{r.notes}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#9CA3AF" }}>
                    {r.raised_by_name ? `Raised by ${r.raised_by_name}` : ""}
                    {r.resolved_by_name ? ` · Resolved by ${r.resolved_by_name}` : ""}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {r.status !== "resolved" && (
                      <button
                        onClick={() => handleResolve(r.id)}
                        disabled={busyId === r.id}
                        style={{
                          fontSize: "10px", padding: "2px 8px", borderRadius: "4px",
                          border: "1px solid #16A34A", background: "#DCFCE7", color: "#16A34A", cursor: "pointer",
                        }}
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={busyId === r.id}
                      style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "4px",
                        border: "1px solid #E5E7EB", background: "#fff", color: "#B91C1C", cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}