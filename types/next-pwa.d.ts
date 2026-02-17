declare module "next-pwa" {
  import type { NextConfig } from "next";

  type PWAOptions = Record<string, any>;
  type WithPWA = (nextConfig?: NextConfig) => NextConfig;

  export default function withPWA(options?: PWAOptions): WithPWA;
}