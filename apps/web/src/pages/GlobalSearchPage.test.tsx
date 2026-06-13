import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { GlobalSearchPage } from "./GlobalSearchPage";
import * as apiClient from "../lib/apiClient";

vi.mock("../lib/apiClient", async () => {
  const actual = await vi.importActual("../lib/apiClient");
  return {
    ...actual,
    searchMeetings: vi.fn(),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GlobalSearchPage", () => {
  it("renders search input and empty state by default", () => {
    renderWithProviders(<GlobalSearchPage />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByText("Semantic Search")).toBeInTheDocument();
  });

  it("calls API and shows loading state, then results", async () => {
    const mockSearch = vi.mocked(apiClient.searchMeetings);
    mockSearch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              results: [
                {
                  meetingId: "123",
                  meetingTitle: "Test Meeting",
                  chunkText: "This is a test chunk",
                  chunkKind: "key_decision",
                  similarityScore: 0.85,
                  startMs: 1000,
                  endMs: 2000,
                  speakerNames: ["John"],
                  sourceSegmentIds: ["seg-1"],
                },
              ],
            });
          }, 10);
        }),
    );

    renderWithProviders(<GlobalSearchPage />);
    const input = screen.getByRole("searchbox");
    const button = screen.getByRole("button", { name: "Search" });

    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.click(button);

    expect(await screen.findByText("Searching across meetings")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Test Meeting")).toBeInTheDocument();
    });

    expect(mockSearch).toHaveBeenCalledWith("test query");
    expect(screen.getByText("This is a test chunk")).toBeInTheDocument();
    expect(screen.getByText("key decision")).toBeInTheDocument();
    expect(screen.getByText("Score: 85.0%")).toBeInTheDocument();
    expect(screen.getByText("Time: 1s")).toBeInTheDocument();
    expect(screen.getByText("Speaker: John")).toBeInTheDocument();

    // Check if the link exists
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.getAttribute("href")).toBe("/meetings/123?segmentId=seg-1");
  });

  it("shows empty state when no results found", async () => {
    const mockSearch = vi.mocked(apiClient.searchMeetings);
    mockSearch.mockResolvedValueOnce({ results: [] });

    renderWithProviders(<GlobalSearchPage />);
    const input = screen.getByRole("searchbox");
    const button = screen.getByRole("button", { name: "Search" });

    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/No matches found for/)).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    const mockSearch = vi.mocked(apiClient.searchMeetings);
    mockSearch.mockRejectedValueOnce(new Error("API Error"));

    renderWithProviders(<GlobalSearchPage />);
    const input = screen.getByRole("searchbox");
    const button = screen.getByRole("button", { name: "Search" });

    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Search failed")).toBeInTheDocument();
    });
    expect(screen.getByText("API Error")).toBeInTheDocument();
  });
});
