import { describe, expect, it } from "vitest";
import { labelChoices, libraryLabels, uniqueLabels } from "../src/core/labels";
import { emptyLibrary, type Video } from "../src/core/types";

describe("video and artist labels", () => {
  it("deduplicates case, whitespace and Unicode without dropping artist punctuation", () => {
    expect(
      uniqueLabels([
        "  Daniel   & Désirée ",
        "daniel & de\u0301sire\u0301e",
        "",
        "Footwork",
        "FOOTWORK",
      ]),
    ).toEqual(["Daniel & Désirée", "Footwork"]);
  });
  it("searches existing labels and offers creation only for a new name", () => {
    expect(
      labelChoices(["Daniel & Désirée", "Footwork"], [], "DÉSIRÉE"),
    ).toEqual({ matches: ["Daniel & Désirée"], create: "DÉSIRÉE" });
    expect(labelChoices(["Footwork"], [], " footwork ")).toEqual({
      matches: ["Footwork"],
      create: "",
    });
    expect(labelChoices(["Footwork"], ["Footwork"], "FOOTWORK")).toEqual({
      matches: [],
      create: "",
    });
    expect(labelChoices([], [], "  ")).toEqual({ matches: [], create: "" });
  });
  it("collects only the current library's video and folder labels", () => {
    const library = emptyLibrary();
    library.videos = [{ labels: ["Footwork", "Artist A"] } as Video];
    library.sources = [
      {
        id: "source",
        connectionId: "account",
        provider: "dropbox",
        folderId: "/",
        name: "Dance",
        defaultStyle: "Salsa",
        defaultLabels: ["footwork", "Partnerwork"],
        writable: false,
      },
    ];
    expect(libraryLabels(library)).toEqual([
      "Artist A",
      "Footwork",
      "Partnerwork",
    ]);
    expect(libraryLabels(emptyLibrary())).toEqual([]);
  });
});
