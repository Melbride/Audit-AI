import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  getWorkspace,
  updateWorkspace,
  getFilePreview,
  getEngagementWorkspaces,
  submitWorkspaceForReview,
  getSectionLatestSubmission,
} from "../services/api";
import FileAnalysisHistory from "../components/FileAnalysisHistory";
import "../styles/WorkspacePage.css";

const API_BASE = 'http://localhost:8000';

export default function WorkspacePage({ user }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [filePreview, setFilePreview] = useState(null);
  const [teamWorkspaces, setTeamWorkspaces] = useState([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [fileResumeState, setFileResumeState] = useState(null);
  const [activeTab, setActiveTab] = useState('workflow');
  const [submitting, setSubmitting] = useState(false);
  const [sectionSubmission, setSectionSubmission] = useState(null);

  // Derive workspace status automatically from the file's actual progress,
  // instead of relying on the auditor to manually keep it in sync
  const getDerivedStatus = () => {
    if (sectionSubmission) {
      switch (sectionSubmission.status) {
        case "Approved":
          return "completed";
        case "Changes Requested":
          return "changes_requested";
        case "Submitted":
        case "Under Review":
          return "review_pending";
        // "Cancelled" or "Draft" falls through to file-stage-derived status below
      }
    }
    if (!fileResumeState) return "active";
    if (fileResumeState.stage === "uploaded") return "active";
    if (fileResumeState.stage === "analysis") return "completed";
    // everything between (mapped, cleaning, tb_validation, account_mapping, financial_analysis)
    return "in_progress";
  };

  const status = getDerivedStatus();

  // Auto-persist the derived status to the DB whenever it changes, so pages
  // like My Workspaces (which read the raw stored column) stay accurate
  // without requiring the auditor to manually click "Save Changes"
  useEffect(() => {
    if (!workspace?.workspace_id) return;
    updateWorkspace(workspace.workspace_id, { status }).catch((err) =>
      console.error("Failed to sync workspace status", err)
    );
  }, [status, workspace?.workspace_id]);

  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceData(workspaceId);
    }
  }, [workspaceId]);

  // Reload file resume state when component mounts or when user returns to the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (workspace?.file_id && workspace?.client_id) {
          loadFileResumeState(workspace.file_id, workspace.client_id);
        }
        if (workspace?.section_id && workspace?.file_id) {
          loadSectionSubmission(workspace.section_id, workspace.file_id);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [workspace]);

  useEffect(() => {
    if (workspace && user && user.role !== "Auditor") {
      if (sectionSubmission?.submission_id) {
        navigate(`/submissions/${sectionSubmission.submission_id}/review`, { replace: true });
      } else if (workspace.engagement_id) {
        navigate(`/engagements/${workspace.engagement_id}`, { replace: true });
      }
    }
  }, [workspace, sectionSubmission, user]);


  const loadWorkspaceData = async (id) => {
    setLoading(true);
    try {
      const res = await getWorkspace(id);
      const data = res.data || res;
      setWorkspace(data);
      setNotes(data.notes || "");

      if (data.file_id && data.client_id) {
        loadFilePreviewData(data.file_id, data.client_id);
        loadFileResumeState(data.file_id, data.client_id);
      }
      if (data.section_id && data.file_id) {
        loadSectionSubmission(data.section_id, data.file_id);
      }

      if (data.engagement_id && user && ["Audit Manager", "Engagement Partner", "Admin"].includes(user.role)) {
        loadTeamWorkspacesData(data.engagement_id);
      }
    } catch (err) {
      console.error("Failed to load workspace", err);
    } finally {
      setLoading(false);
    }
  };

  const loadFilePreviewData = async (fileId, clientId) => {
    try {
      const res = await getFilePreview(fileId, clientId);
      const fileData = res.data || res;
      // Handle case where file is not found
      if (fileData.error && fileData.error.includes("File not found")) {
        console.warn("File not found in uploads table:", fileData.error);
        setFilePreview({ ...fileData, fileNotFound: true });
      } else {
        setFilePreview(fileData);
      }
    } catch (err) {
      console.error("Failed to load file preview", err);
    }
  };

  const loadTeamWorkspacesData = async (engagementId) => {
    try {
      const res = await getEngagementWorkspaces(engagementId);
      setTeamWorkspaces(res.data || res || []);
    } catch (err) {
      console.error("Failed to load team workspaces", err);
    }
  };

  const loadFileResumeState = async (fileId, clientId) => {
    try {
      console.log("Loading file resume state for:", fileId, clientId);
      const res = await axios.get(
        `${API_BASE}/files/${fileId}/resume-state?client_id=${clientId}`
      );
      console.log("File resume state loaded:", res.data);
      // Handle case where file is not found
      if (res.data.stage === 'file_not_found') {
        console.warn("File not found in uploads table:", res.data.error);
        setFileResumeState({ ...res.data, fileNotFound: true });
      } else {
        setFileResumeState(res.data);
      }
    } catch (err) {
      console.error("Failed to load file resume state", err);
      setFileResumeState(null);
    }
  };

  const loadSectionSubmission = async (sectionId, fileId) => {
    if (!sectionId || !fileId) {
      setSectionSubmission(null);
      return;
    }
    try {
      const res = await getSectionLatestSubmission(sectionId, fileId);
      setSectionSubmission(res.data || res || null);
    } catch (err) {
      console.error("Failed to load section submission", err);
      setSectionSubmission(null);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!workspace) return;
    setSaving(true);
    setSaveMessage("");
    try {
      await updateWorkspace(workspace.workspace_id, {
        notes,
        status,
      });
      setSaveMessage("Workspace saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      console.error("Failed to update workspace", err);
      setSaveMessage("Failed to save workspace.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!workspace) return;
    setSubmitting(true);
    try {
      await submitWorkspaceForReview(workspace.workspace_id, {
        submitted_by: user.user_id,
        notes,
      });
      if (workspace.section_id && workspace.file_id) {
        await loadSectionSubmission(workspace.section_id, workspace.file_id);
      }
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (err) {
      console.error("Failed to submit for review", err);
      setSaveMessage(err.response?.data?.detail || "Failed to submit for review.");
    } finally {
      setSubmitting(false);
    }
  };

  const isTrialBalance = fileResumeState?.file_type === 'trial_balance' || fileResumeState?.file_type === 'general_ledger';

  // Once a submission exists and is Submitted/Under Review/Approved, it
  // can't be submitted again from here — only after a reviewer sends it
  // back ("Changes Requested") does the Submit button become usable again.
  const alreadySubmitted = ["Submitted", "Under Review", "Approved"].includes(
    sectionSubmission?.status
  );

  const handleNavigateToMapping = async () => {
    const fId = workspace?.file_id;
    const cId = workspace?.client_id;
    if (fId && cId) {
      localStorage.setItem("pendingFileId", fId);
      localStorage.setItem("pendingClientId", cId);
      
      // Fetch file preview to get columns data
      try {
        const res = await getFilePreview(fId, cId);
        const fileData = res.data || res;
        
        navigate("/mapping", {
          state: {
            fileId: fId,
            clientId: cId,
            uploadResult: { 
              file_id: fId, 
              filename: fileData.filename || workspace.filename || "Uploaded File", 
              client_id: cId,
              columns: fileData.columns || [],
              fill_rates: fileData.fill_rates || {},
              rows: fileData.rows || 0,
              preview: fileData.preview || []
            },
            fileType: workspace.file_type || "general"
          },
        });
      } catch (err) {
        console.error("Failed to fetch file preview for mapping", err);
        // Fallback without columns data
        navigate("/mapping", {
          state: {
            fileId: fId,
            clientId: cId,
            uploadResult: { file_id: fId, filename: workspace.filename || "Uploaded File", client_id: cId },
            fileType: workspace.file_type || "general"
          },
        });
      }
    } else {
      navigate("/mapping");
    }
  };

  const handleNavigateToClean = async () => {
    const fId = workspace?.file_id;
    const cId = workspace?.client_id;
    if (fId && cId) {
      localStorage.setItem("pendingFileId", fId);
      localStorage.setItem("pendingClientId", cId);
      
      // Fetch file preview to get columns data
      try {
        const res = await getFilePreview(fId, cId);
        const fileData = res.data || res;
        
        navigate("/clean", {
          state: {
            fileId: fId,
            clientId: cId,
            uploadResult: { 
              file_id: fId, 
              filename: fileData.filename || workspace.filename || "Uploaded File", 
              client_id: cId,
              columns: fileData.columns || [],
              fill_rates: fileData.fill_rates || {},
              rows: fileData.rows || 0,
              preview: fileData.preview || []
            },
            fileType: workspace.file_type || "general"
          },
        });
      } catch (err) {
        console.error("Failed to fetch file preview for cleaning", err);
        // Fallback without columns data
        navigate("/clean", {
          state: {
            fileId: fId,
            clientId: cId,
            uploadResult: { file_id: fId, filename: workspace.filename || "Uploaded File", client_id: cId },
            fileType: workspace.file_type || "general"
          },
        });
      }
    } else {
      navigate("/clean");
    }
  };

  const handleNavigateToTrialBalance = async () => {
    const fId = workspace?.file_id;
    const cId = workspace?.client_id;
    
    // Fetch file preview to get complete data
    try {
      const res = await getFilePreview(fId, cId);
      const fileData = res.data || res;
      
      navigate("/trial-balance", {
        state: {
          cleanResult: { file_id: fId },
          uploadResult: { 
            file_id: fId, 
            filename: fileData.filename || workspace?.filename || "Trial Balance", 
            client_id: cId,
            columns: fileData.columns || [],
            fill_rates: fileData.fill_rates || {},
            rows: fileData.rows || 0,
            preview: fileData.preview || []
          },
          clientId: cId,
          fileType: workspace?.file_type || 'trial_balance'
        }
      });
    } catch (err) {
      console.error("Failed to fetch file preview for trial balance", err);
      // Fallback without complete data
      navigate("/trial-balance", {
        state: {
          cleanResult: { file_id: fId },
          uploadResult: { file_id: fId, filename: workspace?.filename || "Trial Balance", client_id: cId },
          clientId: cId,
          fileType: workspace?.file_type || 'trial_balance'
        }
      });
    }
  };

  const handleNavigateToAccountMapping = async () => {
    const fId = workspace?.file_id;
    const cId = workspace?.client_id;
    
    // Fetch file preview to get complete data
    try {
      const res = await getFilePreview(fId, cId);
      const fileData = res.data || res;
      
      navigate("/account-mapping", {
        state: {
          cleanResult: { file_id: fId },
          uploadResult: { 
            file_id: fId, 
            filename: fileData.filename || workspace?.filename || "Trial Balance", 
            client_id: cId,
            columns: fileData.columns || [],
            fill_rates: fileData.fill_rates || {},
            rows: fileData.rows || 0,
            preview: fileData.preview || []
          },
          clientId: cId,
          fileType: workspace?.file_type || 'trial_balance'
        }
      });
    } catch (err) {
      console.error("Failed to fetch file preview for account mapping", err);
      // Fallback without complete data
      navigate("/account-mapping", {
        state: {
          cleanResult: { file_id: fId },
          uploadResult: { file_id: fId, filename: workspace?.filename || "Trial Balance", client_id: cId },
          clientId: cId,
          fileType: workspace?.file_type || 'trial_balance'
        }
      });
    }
  };

  const handleNavigateToAnalysis = () => {
    if (workspace?.engagement_id) {
      navigate(`/analysis/${workspace.engagement_id}`);
    } else {
      navigate("/analysis");
    }
  };

  const handleNavigateToEngagement = () => {
    if (workspace?.engagement_id) {
      navigate(`/engagements/${workspace.engagement_id}`);
    } else {
      navigate("/engagements");
    }
  };

  // Resume from where the user left off based on file stage
  const handleResume = async () => {
    if (!fileResumeState || !workspace) return;

    const fId = workspace.file_id;
    const cId = workspace.client_id;

    // Check if file is not found
    if (fileResumeState.stage === 'file_not_found' || fileResumeState.fileNotFound) {
      alert("This file is no longer available. It may have been deleted. Please contact your administrator or upload a new file.");
      return;
    }

    // Fetch file preview data for navigation
    try {
      const res = await getFilePreview(fId, cId);
      const fileData = res.data || res;
      
      // Check if file preview shows file not found
      if (fileData.fileNotFound || (fileData.error && fileData.error.includes("File not found"))) {
        alert("This file is no longer available. It may have been deleted. Please contact your administrator or upload a new file.");
        return;
      }

      const uploadResult = {
        file_id: fId,
        filename: fileData.filename || workspace.filename || "Uploaded File",
        file_type: fileResumeState.file_type || workspace.file_type,
        rows: fileResumeState.row_count || fileData.rows || 0,
        columns: fileData.columns || [],
        fill_rates: fileData.fill_rates || {},
        fingerprint: fileResumeState.fingerprint || '',
      };

      switch (fileResumeState.stage) {
        case 'uploaded':
          navigate('/mapping', { state: { uploadResult, clientId: String(cId) } });
          break;
        case 'mapped':
          navigate('/clean', { state: { uploadResult, clientId: String(cId), fileType: uploadResult.file_type } });
          break;
        case 'cleaning_in_progress': {
          try {
            const formData = new FormData();
            formData.append('file_id', fId);
            formData.append('client_id', String(cId));
            formData.append('file_type', uploadResult.file_type);
            const cleanRes = await axios.post(`${API_BASE}/clean`, formData);
            const cleanResult = {
              file_id: fId,
              file_type: uploadResult.file_type,
              can_proceed: cleanRes.data.can_proceed,
              cleaned_data: cleanRes.data.cleaned_data,
              validation_report: cleanRes.data.validation_report
            };
            if (fileResumeState.has_corrections) {
              navigate('/corrected-results', { state: { cleanResult, uploadResult, clientId: String(cId), fileType: uploadResult.file_type } });
            } else {
              navigate('/clean', { state: { uploadResult, clientId: String(cId), fileType: uploadResult.file_type, cleanResult } });
            }
          } catch {
            navigate('/clean', { state: { uploadResult, clientId: String(cId), fileType: uploadResult.file_type } });
          }
          break;
        }
        case 'clean':
          navigate('/analysis', { state: {
            cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
            clientId: String(cId),
            uploadResult
          }});
          break;
        case 'tb_validation': {
          try {
            const formData = new FormData();
            formData.append('file_id', fId);
            formData.append('client_id', String(cId));
            formData.append('file_type', uploadResult.file_type);
            const cleanRes = await axios.post(`${API_BASE}/clean`, formData);
            const cleanResult = {
              file_id: fId,
              file_type: uploadResult.file_type,
              can_proceed: cleanRes.data.can_proceed,
              cleaned_data: cleanRes.data.cleaned_data,
              validation_report: cleanRes.data.validation_report
            };
            navigate('/trial-balance', { state: {
              cleanResult,
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type,
              workflow: fileResumeState.workflow || null
            }});
          } catch (err) {
            console.error('Failed to fetch cleaned data for TB validation:', err);
            navigate('/trial-balance', { state: {
              cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type,
              workflow: fileResumeState.workflow || null
            }});
          }
          break;
        }
        case 'account_mapping': {
          try {
            const formData = new FormData();
            formData.append('file_id', fId);
            formData.append('client_id', String(cId));
            formData.append('file_type', uploadResult.file_type);
            const cleanRes = await axios.post(`${API_BASE}/clean`, formData);
            const cleanResult = {
              file_id: fId,
              file_type: uploadResult.file_type,
              can_proceed: cleanRes.data.can_proceed,
              cleaned_data: cleanRes.data.cleaned_data,
              validation_report: cleanRes.data.validation_report
            };
            navigate('/account-mapping', { state: {
              cleanResult,
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          } catch (err) {
            console.error('Failed to fetch cleaned data for account mapping:', err);
            navigate('/account-mapping', { state: {
              cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          }
          break;
        }
        case 'financial_analysis': {
          const isTB = uploadResult.file_type === 'trial_balance' || uploadResult.file_type === 'general_ledger';
          if (!isTB) {
            // Normal files skip Financial Statements — it requires account mapping they never went through
            navigate('/analysis', { state: {
              cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
              clientId: String(cId), uploadResult
            }});
            break;
          }
          try {
            const formData = new FormData();
            formData.append('file_id', fId);
            formData.append('client_id', String(cId));
            formData.append('file_type', uploadResult.file_type);
            const cleanRes = await axios.post(`${API_BASE}/clean`, formData);
            const cleanResult = {
              file_id: fId,
              file_type: uploadResult.file_type,
              can_proceed: cleanRes.data.can_proceed,
              cleaned_data: cleanRes.data.cleaned_data,
              validation_report: cleanRes.data.validation_report
            };
            navigate('/financial-statements', { state: {
              cleanResult,
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          } catch (err) {
            console.error('Failed to fetch cleaned data for financial analysis:', err);
            navigate('/financial-statements', { state: {
              cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          }
          break;
        }
        case 'analysis': {
          try {
            const formData = new FormData();
            formData.append('file_id', fId);
            formData.append('client_id', String(cId));
            formData.append('file_type', uploadResult.file_type);
            const cleanRes = await axios.post(`${API_BASE}/clean`, formData);
            const cleanResult = {
              file_id: fId,
              file_type: uploadResult.file_type,
              can_proceed: cleanRes.data.can_proceed,
              cleaned_data: cleanRes.data.cleaned_data,
              validation_report: cleanRes.data.validation_report
            };
            navigate('/analysis', { state: {
              cleanResult,
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          } catch (err) {
            console.error('Failed to fetch cleaned data for financial analysis:', err);
            navigate('/analysis', { state: {
              cleanResult: { file_id: fId, file_type: uploadResult.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
              clientId: String(cId),
              uploadResult,
              fileType: uploadResult.file_type
            }});
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("Failed to resume work", err);
    }
  };

  const getStageBadge = () => {
    if (!fileResumeState) return null;
    switch (fileResumeState.stage) {
      case 'uploaded':
        return <span className="stage-badge stage-uploaded">Uploaded</span>;
      case 'mapped':
        return <span className="stage-badge stage-mapped">Mapped</span>;
      case 'cleaning_in_progress':
        return <span className="stage-badge stage-cleaning">{fileResumeState.total_issues} issue(s)</span>;
      case 'clean':
        return <span className="stage-badge stage-clean">Clean</span>;
      case 'tb_validation':
        return <span className="stage-badge stage-tb-validation">TB Validation</span>;
      case 'account_mapping':
        return <span className="stage-badge stage-account-mapping">Account Mapping</span>;
      case 'financial_analysis':
        return <span className="stage-badge stage-financial-analysis">{isTrialBalance ? "Financial Statements" : "Financial Analysis"}</span>;
      case 'analysis':
        return <span className="stage-badge stage-clean">Analysis Complete</span>;
      case 'file_not_found':
        return <span className="stage-badge stage-error">File Not Found</span>;
      default:
        return <span className="stage-badge stage-uploaded">Unknown</span>;
    }
  };

  const getResumeActionText = () => {
    if (!fileResumeState) return "Resume Work";
    switch (fileResumeState.stage) {
      case 'uploaded':
        return "Start Mapping";
      case 'mapped':
        return "Run Cleaning";
      case 'cleaning_in_progress':
        return "Resume Cleaning";
      case 'clean':
        return "Run Analysis";
      case 'tb_validation':
        return "Continue TB Validation";
      case 'account_mapping':
        return "Continue Account Mapping";
      case 'financial_analysis':
        return isTrialBalance ? "Continue Financial Statements" : "Continue Financial Analysis";
      case 'analysis':
        return "Financial Analysis Complete";
      case 'file_not_found':
        return "File Not Available";
      default:
        return "Resume Work";
    }
  };

  // Get step status based on backend file stage
  const getStepStatus = (step) => {
    if (!fileResumeState) return 'Pending';
    
    const workflow = fileResumeState.workflow || {};
    const currentStage = fileResumeState.stage;
    
    switch (step) {
      case 'mapping':
        if (currentStage === 'mapped' || currentStage === 'cleaning_in_progress' || currentStage === 'clean' || 
            currentStage === 'tb_validation' || currentStage === 'account_mapping' || currentStage === 'financial_analysis' ||
            currentStage === 'analysis') {
          return 'Completed';
        }
        return 'Pending';
      case 'cleaning':
        if (currentStage === 'cleaning_in_progress') {
          return 'In Progress';
        }
        if (currentStage === 'clean' || currentStage === 'tb_validation' || currentStage === 'account_mapping' || 
            currentStage === 'financial_analysis' || currentStage === 'analysis') {
          return 'Completed';
        }
        return 'Pending';
      case 'tb_validation':
        if (workflow.tb_validation_completed) {
          return 'Completed';
        }
        if (currentStage === 'tb_validation') {
          return 'In Progress';
        }
        return 'Pending';
      case 'account_mapping':
        if (workflow.account_mapping_completed) {
          return 'Completed';
        }
        if (currentStage === 'account_mapping') {
          return 'In Progress';
        }
        return 'Pending';
      case 'analysis':
        if (workflow.financial_analysis_completed) {
          return 'Completed';
        }
        if (currentStage === 'financial_analysis' || currentStage === 'analysis') {
          return 'In Progress';
        }
        return 'Pending';
      case 'submission':
        if (!sectionSubmission) return 'Pending';
        switch (sectionSubmission.status) {
          case 'Approved':
            return 'Completed';
          case 'Submitted':
          case 'Under Review':
            return 'In Progress';
          case 'Changes Requested':
            return 'Needs Revision';
          default:
            return 'Pending';
        }
      default:
        return 'Pending';
    }
  };

  const getStepBadgeClass = (step) => {
    const status = getStepStatus(step);
    switch (status) {
      case 'Completed':
        return 'badge-done';
      case 'In Progress':
        return 'badge-in-progress';
      case 'Needs Revision':
        return 'badge-warning';
      default:
        return 'badge-pending';
    }
  };

  const formatStatus = (status) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  };

  if (loading) {
    return <div className="workspace-loading">Loading Auditor Workspace...</div>;
  }

  if (!workspace) {
    return (
      <div className="workspace-error">
        <h2>Workspace Not Found</h2>
        <button onClick={() => navigate("/engagements")} className="btn-save">
          Back to Engagements
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-container">
      {/* Top Header Bar */}
      <div className="workspace-header">
        {/* Row 1: Navigation + Page Title */}
        <div className="header-nav">
          <button className="back-btn" onClick={handleNavigateToEngagement}>
            Back to Engagement
          </button>
          <h2 className="header-page-title">Auditor Workspace</h2>
        </div>

        {/* Row 2: Engagement Info (Hero) + Status & Save */}
        <div className="header-engagement">
          <h1 className="engagement-title">
            {workspace.company_name}: {workspace.engagement_name} (FY {workspace.financial_year || "—"})
          </h1>

          <div className="header-action-group">
            <span className={`status-pill status-${status}`}>
              {formatStatus(status)}
            </span>

            <button className="btn-save" onClick={handleSaveWorkspace} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Row 3: Team Workspaces (if applicable) */}
        {teamWorkspaces.length > 0 && (
          <div className="header-team">
            <button className="btn-team" onClick={() => setShowTeamModal(true)}>
              👥 Team Workspaces ({teamWorkspaces.length})
            </button>
          </div>
        )}
      </div>

      {saveMessage && <div className="save-toast">{saveMessage}</div>}

      {/* Workspace Information - Full Width */}
      <div className="card workspace-info-card">
        <div className="card-header">
          <h2>Workspace Information</h2>
        </div>
        <div className="info-grid">
          <div className="info-item">
            <label>Audit Section</label>
            <span>{workspace.section_name || "General Section"}</span>
          </div>
          <div className="info-item">
            <label>Assigned Auditor</label>
            <span>{workspace.user_name || user?.full_name || "Unassigned"}</span>
          </div>
          <div className="info-item">
            <label>Workspace Status</label>
            <select value={status} className="status-select" disabled>
              <option value="active">Active</option>
              <option value="in_progress">In Progress</option>
              <option value="review_pending">Pending Review</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="info-item inline-info-item">
            <label>ASSOCIATED FILE:</label>
            <span>{filePreview?.filename || workspace?.filename || "No file linked"}</span>
          </div>
        </div>
      </div>

      {/* Return Notice Banner */}
      {sectionSubmission?.status === "Changes Requested" && (
        <div className="card return-notice-card" style={{ backgroundColor: "#fffbe6", marginBottom: "20px", padding: "16px", borderLeft: "4px solid #f59e0b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h3 style={{ margin: 0, color: "#b45309" }}>Changes Requested by Reviewer</h3>
          </div>
          {sectionSubmission.notes && (
            <p style={{ marginTop: "4px", marginBottom: "12px", fontStyle: "italic", color: "#451a03", background: "#ffffff", padding: "10px 14px", borderRadius: "6px", border: "1px solid #fde68a" }}>
              "{sectionSubmission.notes}"
            </p>
          )}
          <p style={{ fontSize: "13px", color: "#78350f", marginBottom: "12px" }}>
            This submission was returned for corrections. Select a stage below to make the required adjustments:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button className="btn-save" onClick={handleNavigateToMapping} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Go to Column Mapping
            </button>
            <button className="btn-save" onClick={handleNavigateToClean} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Go to Data Cleaning
            </button>
            {isTrialBalance && (
              <>
                <button className="btn-save" onClick={handleNavigateToTrialBalance} style={{ fontSize: "12px", padding: "6px 12px" }}>
                  Go to TB Validation
                </button>
                <button className="btn-save" onClick={handleNavigateToAccountMapping} style={{ fontSize: "12px", padding: "6px 12px" }}>
                  Go to Account Mapping
                </button>
              </>
            )}
            <button className="btn-save" onClick={handleNavigateToAnalysis} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Go to Financial Analysis
            </button>
          </div>
        </div>
      )}

      {/* Audit Execution Hub - Main Card */}
      <div className="card execution-hub-card">
        <div className="card-header">
          <h2>Audit Execution Hub</h2>
        </div>
        <p className="card-subtitle">Track progress through the audit workflow for this file.</p>

        {/* Tabs */}
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === 'workflow' ? 'active' : ''}`}
            onClick={() => setActiveTab('workflow')}
          >
            Workflow
          </button>
          <button 
            className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            File Preview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Analysis History
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'workflow' && (
            <div className="workflow-tab">
              {/* Current Stage */}
              <div className="current-stage-section">
                <div className="stage-group">
                  <div className="stage-label">Current Stage:</div>
                  <div className="stage-value">
                    <select
                      className="stage-dropdown"
                      value={fileResumeState?.stage || 'uploaded'}
                      disabled
                    >
                      <option value="uploaded">Uploaded</option>
                      <option value="mapped">Mapped</option>
                      <option value="cleaning_in_progress">Cleaning in Progress</option>
                      <option value="clean">Clean</option>
                      <option value="tb_validation">TB Validation</option>
                      <option value="account_mapping">Account Mapping</option>
                      <option value="financial_analysis">Financial Statements</option>
                      <option value="analysis">Analysis Complete — Ready for Submission</option>
                    </select>
                  </div>
                </div>
                <div className="resume-button-inline">
                  {fileResumeState?.stage === 'analysis' ? (
                    alreadySubmitted ? (
                      <span className="status-note">
                        Already submitted — status: {sectionSubmission.status}
                      </span>
                    ) : (
                      <button className="btn-save" onClick={handleSubmitForReview} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit for Review"}
                      </button>
                    )
                  ) : (
                    <button 
                      className="btn-save" 
                      onClick={handleResume}
                      disabled={!fileResumeState || fileResumeState?.stage === 'file_not_found'}
                    >
                      {fileResumeState ? getResumeActionText() : 'Loading...'}
                    </button>
                  )}
                </div>
                <div className="last-updated-inline">
                  <div className="stage-label">Last Updated:</div>
                  <div className="stage-value">
                    {fileResumeState?.last_cleaned_at 
                      ? `${new Date(fileResumeState.last_cleaned_at).toLocaleDateString()} • ${new Date(fileResumeState.last_cleaned_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                      : 'Checking file status...'}
                  </div>
                </div>
                <button 
                  className="btn-refresh" 
                  onClick={() => workspace?.file_id && workspace?.client_id && loadFileResumeState(workspace.file_id, workspace.client_id)}
                  title="Refresh file status"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6"></path>
                    <path d="M1 20v-6h6"></path>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                </button>
              </div>

              {/* Workflow Progress */}
              <div className="stage-progress-list">
                <h4>Workflow Progress</h4>
                <div className="progress-item">
                  <span className="progress-label">Column Mapping</span>
                  <span className={`progress-status ${getStepStatus('mapping') === 'Completed' ? 'status-done' : 'status-pending'}`}>
                    {getStepStatus('mapping')}
                  </span>
                </div>
                <div className="progress-item">
                  <span className="progress-label">Data Cleaning</span>
                  <span className={`progress-status ${getStepStatus('cleaning') === 'Completed' ? 'status-done' : getStepStatus('cleaning') === 'In Progress' ? 'status-in-progress' : 'status-pending'}`}>
                    {getStepStatus('cleaning')}
                  </span>
                </div>
                {isTrialBalance && (
                  <>
                    <div className="progress-item">
                      <span className="progress-label">Trial Balance Validation</span>
                      <span className={`progress-status ${getStepBadgeClass('tb_validation')}`}>
                        {getStepStatus('tb_validation')}
                      </span>
                    </div>
                    <div className="progress-item">
                      <span className="progress-label">Account Mapping</span>
                      <span className={`progress-status ${getStepBadgeClass('account_mapping')}`}>
                        {getStepStatus('account_mapping')}
                      </span>
                    </div>
                  </>
                )}
                <div className="progress-item">
                  <span className="progress-label">{isTrialBalance ? 'Financial Statements' : 'Financial Analysis'}</span>
                  <span className={`progress-status ${getStepBadgeClass('analysis')}`}>
                    {getStepStatus('analysis')}
                  </span>

                </div>
                <div className="progress-item">
                  <span className="progress-label">Submission</span>
                  <span className={`progress-status ${getStepBadgeClass('submission')}`}>
                    {getStepStatus('submission')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preview' && filePreview && (
            <div className="preview-tab">
              <div className="file-info-bar">
                <div className="file-info-item">
                  <strong>Filename:</strong> {filePreview.filename}
                </div>
                <div className="file-info-item">
                  <strong>Total Rows:</strong> {filePreview.rows}
                </div>
                <div className="file-info-item">
                  <strong>Columns:</strong> {filePreview.columns?.length || 0}
                </div>
              </div>
              <div className="mini-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      {filePreview.columns?.slice(0, 6).map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filePreview.preview?.slice(0, 8).map((row, idx) => (
                      <tr key={idx}>
                        {filePreview.columns?.slice(0, 6).map((col) => (
                          <td key={col}>{String(row[col] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'preview' && !filePreview && (
            <div className="preview-tab empty-state">
              <p>No file preview available</p>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-tab">
              {workspace?.engagement_id && workspace?.file_id ? (
                <FileAnalysisHistory
                  engagementId={workspace.engagement_id}
                  fileId={workspace.file_id}
                  user={user}
                />
              ) : (
                <p className="empty-message">No file linked to this workspace yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Auditor Working Notes - Full Width */}
      <div className="card notes-card">
        <div className="card-header">
          <h2>Auditor Working Notes</h2>
        </div>
        <p className="card-subtitle">Record audit observations, findings, procedures and references.</p>
        <textarea
          className="workspace-notes-area"
          placeholder="Type your working paper notes, findings, or observations here..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
        />
        <div className="notes-footer">
          <button className="btn-save" onClick={handleSaveWorkspace} disabled={saving}>
            {saving ? "Saving Notes..." : "Save Notes"}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Success</h2>
              <button className="modal-close" onClick={() => setShowSuccessModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="success-message">
                <div className="success-icon">✓</div>
                <p>Submitted for review successfully!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Workspaces Modal (for Managers) */}
      {showTeamModal && (
        <div className="modal-overlay" onClick={() => setShowTeamModal(false)}>
          <div className="modal-content team-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Team Auditor Workspaces</h2>
              <button className="modal-close" onClick={() => setShowTeamModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <table className="team-workspaces-table">
                <thead>
                  <tr>
                    <th>Auditor</th>
                    <th>Role</th>
                    <th>Audit Section</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teamWorkspaces.map((tw) => (
                    <tr key={tw.workspace_id}>
                      <td>{tw.user_name}</td>
                      <td>{tw.user_role}</td>
                      <td>{tw.section_name || "General"}</td>
                      <td>
                        <span className={`status-pill status-${tw.status}`}>
                          {tw.status}
                        </span>
                      </td>
                      <td>{new Date(tw.updated_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn-save"
                          onClick={() => {
                            setShowTeamModal(false);
                            navigate(`/workspace/${tw.workspace_id}`);
                          }}
                        >
                          View Workspace
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
