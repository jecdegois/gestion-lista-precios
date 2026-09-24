"use client";

import { useAuditEvents } from "../hooks/useAuditEvents";
import AuditTable from "./table/AuditTable";

export default function AuditView() {
  return <AuditTable events={useAuditEvents()} />;
}
