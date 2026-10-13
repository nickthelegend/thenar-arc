/**
 * The company's home, where one origin serves both sites (a local build):
 * there "/" is the app's front door (proxy.ts), so ThenarLabs lives here. On
 * thenar.io it is "/", and this page is the same one.
 */
export { default, metadata } from "../page";

export const revalidate = 300;
