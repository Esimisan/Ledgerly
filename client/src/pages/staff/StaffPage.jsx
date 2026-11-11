import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import { listMembers } from "../../data/staff";
import MembersCard from "./MembersCard";
import InvitationsCard from "./InvitationsCard";
import RolePermissionsCard from "./RolePermissionsCard";
import OwnershipCard from "./OwnershipCard";
import "../../styles/staff.css";

export default function StaffPage() {
  const { business, isOwner } = useAuth();
  const members = useRpcQuery(() => listMembers(business.id), [business.id]);

  return (
    <div className="stack">
      <PageHeader
        title="Staff"
        subtitle="Invite your team, choose what each role can do, and manage who has access."
      />
      <MembersCard businessId={business.id} query={members} />
      <InvitationsCard businessId={business.id} />
      <RolePermissionsCard businessId={business.id} />
      {isOwner && <OwnershipCard business={business} members={members.data} />}
    </div>
  );
}
