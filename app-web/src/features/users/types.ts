import type { RoleCode, UserStatusDomain } from "@/lib/domain-types";

export type Assignment = { company: string; role: RoleCode };

export type UserView = {
  id: string;
  email: string;
  fullName: string;
  status: UserStatusDomain;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  lastLoginAt: string | null;
  assignments: Assignment[];
};

export type Catalogs = {
  companies: { code: string; name: string }[];
  roles: { code: RoleCode; name: string }[];
};

export type UserListing = Catalogs & { users: UserView[] };
