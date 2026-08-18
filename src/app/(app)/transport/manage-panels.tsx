"use client";

import { saveRoute, saveVehicle } from "@/app/(app)/transport/actions";
import { ManageForm } from "@/components/manage-form";

const VEHICLE_TYPES = [
  { value: "BUS", label: "Bus" },
  { value: "VAN", label: "Van" },
  { value: "CAR", label: "Car" },
  { value: "TEMPO", label: "Tempo traveller" },
];

export function AddVehicle() {
  return (
    <ManageForm
      title="Add a vehicle"
      description="Registration must be unique on the fleet"
      action={saveVehicle}
      submitLabel="Add vehicle"
      footnote="Compliance dates left blank show as “unknown”, never as valid."
      fields={[
        { name: "registrationNo", label: "Registration", required: true, placeholder: "KA01AB1234", half: true },
        { name: "vehicleType", label: "Type", type: "select", required: true, options: VEHICLE_TYPES, defaultValue: "BUS", half: true },
        { name: "model", label: "Model", placeholder: "Tata Starbus", half: true },
        { name: "capacity", label: "Seats", type: "number", min: "1", required: true, defaultValue: "40", half: true },
        { name: "driverName", label: "Driver", half: true },
        { name: "driverPhone", label: "Driver phone", half: true },
        { name: "driverLicense", label: "Licence no.", half: true },
        { name: "gpsDeviceId", label: "GPS device", half: true },
        { name: "insuranceExpiry", label: "Insurance expires", type: "date", half: true },
        { name: "fitnessExpiry", label: "Fitness expires", type: "date", half: true },
        { name: "pollutionExpiry", label: "Pollution expires", type: "date", half: true },
      ]}
    />
  );
}

export function AddRoute({ vehicles }: { vehicles: { value: string; label: string }[] }) {
  return (
    <ManageForm
      title="Add a route"
      description="Stops are added from the route page"
      action={saveRoute}
      submitLabel="Create route"
      fields={[
        { name: "name", label: "Route name", required: true, placeholder: "Whitefield loop" },
        { name: "code", label: "Code", placeholder: "R4", half: true },
        {
          name: "vehicleId",
          label: "Vehicle",
          type: "select",
          options: vehicles,
          hint: "Can be assigned later.",
          half: true,
        },
        { name: "startPoint", label: "Starts at", half: true },
        { name: "endPoint", label: "Ends at", half: true },
        { name: "distanceKm", label: "Distance (km)", type: "number", min: "0", step: "0.1", half: true },
      ]}
    />
  );
}
