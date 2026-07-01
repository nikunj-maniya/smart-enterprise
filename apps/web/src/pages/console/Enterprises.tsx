import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function Enterprises() {
  return (
    <>
      <PageHeader
        title="Enterprises"
        subtitle="All onboarded tenants. Suspend an enterprise to block its users from signing in."
      />
      <Placeholder note="Enterprises table with suspend/reactivate lands in Slice 4." />
    </>
  );
}
