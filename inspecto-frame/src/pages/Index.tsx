import { useState } from "react";
import AssistedInspectionV3 from "@/components/AssistedInspectionV3";
import InspectionDashboard, { InspectionRecord } from "@/components/InspectionDashboard";
import {
  fetchUveyeInspection,
  buildInspectionRecordFromResponse,
  type UveyeInspectionResponse,
} from "@/services/uveyeApi";

type ViewState = { type: "dashboard" } | { type: "inspection"; id: string };

const Index = () => {
  const [view, setView] = useState<ViewState>({ type: "dashboard" });
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [payloads, setPayloads] = useState<Record<string, UveyeInspectionResponse>>({});
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrieveError, setRetrieveError] = useState<string | null>(null);

  const handleRetrieveFromApi = async (inspectionId: string) => {
    const id = inspectionId.trim();
    if (!id) return;
    setRetrieveError(null);
    setIsRetrieving(true);
    try {
      const response = await fetchUveyeInspection({
        inspectionId: id,
        alertsOnly: false,
        showTreadPolygons: false,
      });
      const record = buildInspectionRecordFromResponse(id, response);
      const key = record.id;
      setPayloads((prev) => ({ ...prev, [key]: response }));
      setInspections((prev) => {
        const without = prev.filter((i) => i.id !== key);
        return [record, ...without];
      });
      setView({ type: "inspection", id: key });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to retrieve inspection.";
      setRetrieveError(msg);
    } finally {
      setIsRetrieving(false);
    }
  };

  if (view.type === "inspection") {
    const payload = payloads[view.id];
    const inspection = inspections.find((i) => i.id === view.id);
    const label = inspection
      ? `${inspection.year} ${inspection.make} ${inspection.model}`
      : "Inspection";

    if (!payload) {
      return (
        <div className="h-screen w-full flex items-center justify-center text-muted-foreground text-sm">
          Missing inspection data. Return to the dashboard and retrieve again.
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col">
        <AssistedInspectionV3
          key={view.id}
          payload={payload}
          vehicleLabel={label}
          onBack={() => setView({ type: "dashboard" })}
          vehicleType={inspection?.bodyType}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      <InspectionDashboard
        inspections={inspections}
        onSelect={(id) => setView({ type: "inspection", id })}
        onRetrieveFromApi={handleRetrieveFromApi}
        isRetrieving={isRetrieving}
        retrieveError={retrieveError}
      />
    </div>
  );
};

export default Index;
