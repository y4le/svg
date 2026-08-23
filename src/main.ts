import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { WorkbenchApp } from "./app/WorkbenchApp";
import { readDemoShortname } from "./demos/demoUrl";
import { DEMOS } from "./demos/roster";

const mount = document.querySelector<HTMLElement>("#app");

if (!mount) throw new Error("Missing #app mount point");

new WorkbenchApp(mount, {
  demos: DEMOS,
  initialDemo: readDemoShortname(window.location.search),
});
