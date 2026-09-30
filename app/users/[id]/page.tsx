import { users, getUser } from "@/lib/data/users";
import { UserProfile } from "@/components/user-profile";

export function generateStaticParams() {
  return users.map((u) => ({ id: u.id }));
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = getUser(id);
  if (!u) return <div className="py-20 text-center text-slate-400">User not found.</div>;
  return <UserProfile userId={u.id} />;
}
