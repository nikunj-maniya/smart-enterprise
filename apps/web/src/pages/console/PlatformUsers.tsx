import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function PlatformUsers() {
  return (
    <>
      <PageHeader
        title="Platform Users"
        subtitle="Notable accounts across all enterprises. Enterprise Admins manage their own user directories."
      />
      <Placeholder note="Cross-enterprise users table lands in Slice 5." />
    </>
  );
}
