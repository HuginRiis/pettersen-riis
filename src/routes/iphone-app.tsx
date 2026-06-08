import { createFileRoute } from "@tanstack/react-router";
import { SmartDashbord } from "./smart-dashbord";

export const Route = createFileRoute("/iphone-app")({
  head: () => ({
    meta: [
      { title: "iPhone App – Smart Dashbord" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#0a0d13" },
    ],
  }),
  component: IphoneApp,
});

function IphoneApp() {
  return (
    <div className="iphone-mode">
      <SmartDashbord />
    </div>
  );
}
