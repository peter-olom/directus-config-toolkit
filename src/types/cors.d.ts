// Add type declarations for packages that don't have TypeScript definitions

declare module "cors" {
  import { RequestHandler } from "express";
  function cors(options?: any): RequestHandler;
  export = cors;
}
