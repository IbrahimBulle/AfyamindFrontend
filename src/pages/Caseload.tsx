import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CHWCaseload, type CHWCaseloadPatient, type CHWCertificateRequest } from "@/lib/api";
import { AlertTriangle, MessageSquareHeart, Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Caseload() {
  const { toast } = useToast();
  const [caseload, setCaseload] = useState<CHWCaseload | null>(null);
  const [certificateRequests, setCertificateRequests] = useState<CHWCertificateRequest[]>([]);
  const [loadingPatientId, setLoadingPatientId] = useState<number | null>(null);
  const [approvingPatientId, setApprovingPatientId] = useState<number | null>(null);

  useEffect(() => {
    void loadCaseload();
  }, []);

  const loadCaseload = async () => {
    try {
      const [caseloadData, requests] = await Promise.all([
        api.getCHWCaseload(),
        api.getCHWCertificateRequests(),
      ]);
      setCaseload(caseloadData);
      setCertificateRequests(requests);
    } catch (error: any) {
      toast({
        title: "Unable to load caseload",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSendMotivation = async (patient: CHWCaseloadPatient) => {
    if (!patient.patient_phone?.trim()) {
      toast({
        title: "Missing patient phone",
        description: "This patient needs a phone number on file before SMS motivation can be sent.",
        variant: "destructive",
      });
      return;
    }

    setLoadingPatientId(patient.patient_id);
    try {
      const response = await api.sendMotivation({
        to: patient.patient_phone.trim(),
        language: patient.language,
      });
      toast({
        title: "Motivation sent by SMS",
        description: response.message,
      });
    } catch (error: any) {
      toast({
        title: "Unable to send motivation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingPatientId(null);
    }
  };

  const handleApproveCertificate = async (patientId: number) => {
    setApprovingPatientId(patientId);
    try {
      await api.approveCHWCertificateRequest(patientId);
      toast({
        title: "Certificate approved",
        description: "The patient can now download their certificate.",
      });
      await loadCaseload();
    } catch (error: any) {
      toast({
        title: "Unable to approve certificate",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApprovingPatientId(null);
    }
  };

  return (
    <div className="animate-fade-in flex flex-col gap-8">
      <header>
        <h1 className="text-4xl tracking-tight">Your Caseload</h1>
        <p className="text-muted-foreground mt-2">
          {caseload ? `${caseload.total_patients} patients assigned to you` : "Loading..."}
        </p>
      </header>

      <div className="card-elevated p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-2xl tracking-tight">Certificate Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review patients who finished their exercises and asked for certificate approval.
          </p>
        </div>

        {certificateRequests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
            No pending certificate review requests right now.
          </div>
        )}

        {certificateRequests.map((request) => (
          <div key={request.patient_id} className="rounded-3xl border border-border/70 bg-background/70 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="font-medium">{request.patient_name}</div>
              <div className="text-sm text-muted-foreground">
                Risk: <span className="capitalize">{request.current_risk_level}</span>
                <span className="mx-2">·</span>
                Requested {request.certificate_requested_at ? formatDateTime(request.certificate_requested_at) : "recently"}
              </div>
              <div className="text-xs text-muted-foreground">
                Exercise: {request.exercise_complete ? "done" : "pending"}
                <span className="mx-2">·</span>
                CHW support: {request.chw_chat_complete ? "done" : "pending"}
                <span className="mx-2">·</span>
                Guidance: {request.guidance_complete ? "done" : "pending"}
              </div>
              {request.reflection && (
                <div className="text-sm text-muted-foreground">
                  Reflection: {request.reflection}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button asChild variant="outline" className="rounded-full">
                <Link to={`/care-chat?target=${request.patient_id}`}>Open Chat</Link>
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={approvingPatientId === request.patient_id || request.certificate_approved}
                onClick={() => void handleApproveCertificate(request.patient_id)}
              >
                {request.certificate_approved
                  ? "Approved"
                  : approvingPatientId === request.patient_id
                    ? "Approving..."
                    : "Approve Certificate"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {caseload?.patients?.map((patient) => {
          const isSending = loadingPatientId === patient.patient_id;

          return (
            <div key={patient.patient_id} className="card-elevated p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-medium">
                    {patient.patient_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{patient.patient_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {patient.region} · {patient.total_checkins} check-ins
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      <Phone className="h-3.5 w-3.5" />
                      {patient.patient_phone || "No phone number on file"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {patient.last_risk_level === "high" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  <span className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${riskColor(patient.last_risk_level)}`}>
                    {patient.last_risk_level}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild type="button" variant="outline" className="rounded-full">
                  <Link to={`/care-chat?target=${patient.patient_id}`}>Open Care Chat</Link>
                </Button>
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={isSending}
                  onClick={() => void handleSendMotivation(patient)}
                >
                  <MessageSquareHeart className="mr-2 h-4 w-4" />
                  {isSending ? "Sending..." : "Send SMS Motivation"}
                </Button>
              </div>
            </div>
          );
        })}

        {caseload?.patients?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No patients assigned yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function riskColor(level: string) {
  switch (level) {
    case "high":
      return "bg-destructive/10 text-destructive";
    case "medium":
      return "bg-sun/50 text-foreground";
    default:
      return "bg-sage/20 text-foreground";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
