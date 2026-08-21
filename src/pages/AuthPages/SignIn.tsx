import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Preventive Maintenance Online"
        description="This is Sean Julius Lase's Model"
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
