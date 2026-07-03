import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function Profile() {
  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle="Personal info and password, shared across every role."
        breadcrumb="Account"
      />
      <Placeholder note="Profile is coming in Slice 8." />
    </>
  );
}
