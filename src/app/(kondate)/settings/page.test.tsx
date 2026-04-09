import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";
import { HOTCOOK_MODEL_STORAGE_KEY } from "@/lib/preferences/hotcook-model";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads the saved hotcook model from localStorage", () => {
    window.localStorage.setItem(HOTCOOK_MODEL_STORAGE_KEY, "KN-HW16H");

    render(<SettingsPage />);

    expect(screen.getByText("KN-HW16H (1.6L)")).toBeInTheDocument();
  });

  it("persists a newly selected model", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /機種KN-HW24H/ }));
    fireEvent.click(screen.getByRole("button", { name: "KN-HW24E (2.4L)" }));

    expect(window.localStorage.getItem(HOTCOOK_MODEL_STORAGE_KEY)).toBe("KN-HW24E");
    expect(screen.getByText("✓ 保存しました")).toBeInTheDocument();
  });
});
