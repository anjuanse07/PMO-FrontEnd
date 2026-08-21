import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";

export default function SignUp() {
  return (
    <>
      <PageMeta
        title="Preventive Maintenance Online"
        description="This is Sean Julius Lase's Model"
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
