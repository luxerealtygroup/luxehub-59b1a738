import { OrgResourceList } from '@/components/resources/OrgResourceList';

export default function TenantsResources() {
  return (
    <OrgResourceList
      category="tenants"
      title="Tenants Resources"
      subtitle="Tools and materials for tenant clients."
    />
  );
}