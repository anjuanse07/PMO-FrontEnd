import PageBreadcrumb from "../components/common/PageBreadCrumb";
import UserMetaCard from "../components/UserProfile/UserMetaCard";
import UserInfoCard from "../components/UserProfile/UserInfoCard";
import PageMeta from "../components/common/PageMeta";
import { getCurrentUser, getRoleLabel } from "../auth/auth";

export default function UserProfiles() {
  const currentUser = getCurrentUser();

  return (
    <>
      <PageMeta
        title="Preventive Maintenance Online | profile"
        description="This is Sean Julius Lase's Model"
      />
      <PageBreadcrumb pageTitle="Profile" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Profile
        </h3>
        {currentUser && (
          <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
            Logged in as: {currentUser.name} ({getRoleLabel(currentUser.role)})
          </div>
        )}
        <div className="space-y-6">
          <UserMetaCard />
          <UserInfoCard />
        </div>
      </div>
    </>
  );
}
