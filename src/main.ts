import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { WorkbenchApp } from "./app/WorkbenchApp";

const mount = document.querySelector<HTMLElement>("#app");

if (!mount) throw new Error("Missing #app mount point");

new WorkbenchApp(mount);
