import { screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";
import { renderWithProviders } from "./test/renderWithProviders";

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  return renderWithProviders(<RouterProvider router={router} />);
}

describe("ScribeFlow routes", () => {
  it("renders the dashboard at the root route", () => {
    renderRoute("/");

    expect(
      screen.getByRole("heading", {
        name: /meeting intelligence, ready for every recording/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /new meeting/i }).length,
    ).toBeGreaterThan(0);
  });

  it("renders a designed not-found state for unknown routes", () => {
    renderRoute("/missing-route");

    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
  });
});
