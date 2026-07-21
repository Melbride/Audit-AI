import { useState, useEffect } from "react";
import { getSectionMilestones, updateMilestone } from "../services/api";

const STATUS_OPTIONS = ["pending", "in_progress", "done"];

const STATUS_COLORS = {
  pending: "#9CA3AF",
  in_progress: "#EAB308",
  done: "#16A34A",
};

export default function SectionMilestones({ sectionId, user }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getSectionMilestones(sectionId);
      setMilestones(res.data);
    } catch (err) {
      console.error("Failed to load milestones", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sectionId]);

  const handleStatusChange = async (milestoneId, status) => {
    setSavingId(milestoneId);
    try {
      await updateMilestone(milestoneId, {
        status,
        updated_by: user?.user_id,
      });
      await load();
    } catch (err) {
      console.error("Failed to update milestone", err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <p style={{ fontSize: "12px", color: "#6B7280" }}>Loading milestones…</p>;
  }

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      {milestones.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid #E5E7EB",
            background: "#FFFFFF",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: STATUS_COLORS[m.status] || "#9CA3AF",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#111827" }}>
            {m.milestone_name}
          </span>
          <select
            value={m.status}
            disabled={savingId === m.id}
            onChange={(e) => handleStatusChange(m.id, e.target.value)}
            style={{
              fontSize: "11px",
              padding: "2px 4px",
              border: "1px solid #E5E7EB",
              borderRadius: "4px",
              background: "#F9FAFB",
              width: "auto",
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          {m.completed_by_name && m.status === "done" && (
            <span style={{ fontSize: "10px", color: "#6B7280" }}>
              by {m.completed_by_name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}