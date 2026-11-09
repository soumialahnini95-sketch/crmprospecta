import { useState, type ChangeEvent } from "react";
import { crmMemberInitials, crmMemberName, type AssignableCrmMember } from "@/lib/team";

type AssigneeControlProps = {
  prospectId: string;
  prospectName: string;
  assignedTo: string | null;
  members: AssignableCrmMember[];
  canAssign: boolean;
  assignmentReady: boolean;
  onAssign: (prospectId: string, email: string | null) => Promise<void>;
};

export default function AssigneeControl({
  prospectId,
  prospectName,
  assignedTo,
  members,
  canAssign,
  assignmentReady,
  onAssign,
}: AssigneeControlProps) {
  const [saving, setSaving] = useState(false);
  const canChoose = canAssign && assignmentReady && members.length > 0;

  const handleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const email = event.currentTarget.value || null;
    if (email === assignedTo) return;
    setSaving(true);
    try {
      await onAssign(prospectId, email);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="assignee-control" aria-label={`Responsable de ${prospectName}`}>
      <div className="assignee-summary">
        <span className={`assignee-avatar${assignedTo ? "" : " assignee-avatar-empty"}`} title={assignedTo ?? "Non assigné"}>
          {crmMemberInitials(assignedTo)}
        </span>
        <span className="assignee-name">{crmMemberName(assignedTo)}</span>
      </div>
      {canChoose && (
        <select
          className="assignee-select"
          aria-label={`Changer le responsable de ${prospectName}`}
          value={assignedTo ?? ""}
          disabled={saving}
          onChange={handleChange}
        >
          <option value="">Non assigné</option>
          {assignedTo && !members.some(member => member.email === assignedTo) && (
            <option value={assignedTo}>{crmMemberName(assignedTo)}</option>
          )}
          {members.map(member => (
            <option value={member.email} key={member.email}>{crmMemberName(member.email)}</option>
          ))}
        </select>
      )}
    </div>
  );
}
