import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "../components/Icons";
import ReportReview from "../components/ReportReview";

export default function ReportDetail({ user }) {
  const { reportId } = useParams();

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui" }}>
      <div className="px-6 pt-6">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors"
        >
          {/* <ArrowLeft size={14} /> */}
          Back to reports
        </Link>
      </div>
      <ReportReview reportId={reportId} user={user} />
    </div>
  );
}