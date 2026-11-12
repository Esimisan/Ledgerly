import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import BusinessCard from "./BusinessCard";
import ProfileCard from "./ProfileCard";
import PasswordCard from "./PasswordCard";
import "../../styles/settings.css";

export default function SettingsPage() {
  const { business, can, refreshMemberships } = useAuth();
  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        subtitle="Your business details, your profile and your password."
      />
      {can("settings.manage") ? (
        <BusinessCard business={business} onSaved={refreshMemberships} />
      ) : (
        <section className="card">
          <h2 className="card__title">Business details</h2>
          <p className="info-note">
            Only people who can manage settings can change the business details.
            Ask the owner or an admin.
          </p>
        </section>
      )}
      <ProfileCard />
      <PasswordCard />
    </div>
  );
}
