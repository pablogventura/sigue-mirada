import "./ui/overlay.css";
import { App } from "./app/App";

const host = document.querySelector<HTMLElement>("#viewport");
if (!host) throw new Error("Missing #viewport");

new App(host).start();
