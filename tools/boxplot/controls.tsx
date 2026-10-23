// Sidebar plot controls: the collapsible ControlSection primitive and the
// full PlotControls panel (plot-style toggle, shape/fill sliders, color
// picker, facet/subgroup selector, axes & labels). Shared UI (ActionsPanel,
// SliderControl, ColorInput, BaseStyleControls, GroupColorEditor, PALETTE,
// scrollDisclosureIntoView) resolves through shared.bundle.js.

import {
  ActionsPanel,
  BarStyleIcon,
  BaseStyleControls,
  BoxStyleIcon,
  ColorInput,
  ControlSection,
  ControlTabs,
  DiscretePaletteRow,
  GroupColorEditor,
  OnOffToggle,
  PlotStyleIconPicker,
  RaincloudStyleIcon,
  SegToggle,
  SliderControl,
  ViolinStyleIcon,
  applyDiscretePalette,
} from "../_shell";
import { isCompositionTestable } from "./helpers";
import type { BoxplotGroup, BoxplotVis, PlotControlsProps } from "./helpers";
import { useT } from "./i18n";

export function PlotControls({
  dataFormat,
  setDataFormat,
  setStep,
  resetAll,
  allDisplayGroups,
  boxplotGroups,
  renamedRows,
  setPlotGroupRenames,
  setBoxplotColors,
  onToggleGroup,
  vis,
  updVis,
  colorByCol,
  setColorByCol,
  colorByCandidates,
  colNames,
  categoryColors,
  setCategoryColors,
  colorByCategories,
  facetByCol,
  setFacetByCol,
  subgroupByCol,
  setSubgroupByCol,
  onDownloadSvg,
  onDownloadPng,
  dataDownloads,
  compositionTables,
  onSendComposition,
}: PlotControlsProps) {
  const tr = useT();
  const sv = (k: keyof BoxplotVis) => (v: unknown) => updVis({ [k]: v } as Partial<BoxplotVis>);
  const handleColorChange = (i: number, c: string) => {
    const name = boxplotGroups[i].name;
    setBoxplotColors((p: Record<string, string>) => ({ ...p, [name]: c }));
  };
  const handleNameChange = (i: number, v: string) => {
    const name = boxplotGroups[i].name;
    setPlotGroupRenames((p: Record<string, string>) => ({ ...p, [name]: v }));
  };
  // When the user picks a discrete palette, clobber every group's per-group
  // colour with the resolved hex list. Predictable and undoable: the user
  // can hand-edit individual swatches afterward, or pick a different palette
  // (or "okabe-ito") to revert.
  const handlePaletteChange = (next: string) => {
    updVis({ discretePalette: next });
    const orderedNames = allDisplayGroups.map((g: BoxplotGroup) => g.name);
    const resolved = applyDiscretePalette(next, orderedNames);
    setBoxplotColors(resolved);
  };
  const handleColorByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    setColorByCol(v);
    if (v >= 0) {
      const cats = [...new Set<string>(renamedRows.map((r: string[]) => r[v]))].sort();
      const cc = applyDiscretePalette(vis.categoryPalette || "okabe-ito", cats);
      setCategoryColors(cc);
    }
  };
  // Independent of `handlePaletteChange` above: clobbers the per-category
  // colour record using the picked palette. Keyed off the currently visible
  // colorByCategories so the user sees the change immediately.
  const handleCategoryPaletteChange = (next: string) => {
    updVis({ categoryPalette: next });
    const cats = Array.isArray(colorByCategories) ? colorByCategories : [];
    const cc = applyDiscretePalette(next, cats);
    setCategoryColors(cc);
  };
  return (
    <ControlTabs
      tool="boxplot"
      tabs={[
        {
          id: "groups",
          label: tr("boxplot.tab.groups"),
          content: (
            <>
              {/* Wide format banner */}
              {dataFormat === "wide" && (
                <div
                  className="dv-panel"
                  style={{
                    background: "var(--success-bg)",
                    borderColor: "var(--success-border)",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 15 }}>⚡</span>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color: "var(--success-text)",
                        fontWeight: 600,
                      }}
                    >
                      {tr("boxplot.ctrl.wideDetected")}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDataFormat("long");
                      setStep("configure");
                    }}
                    style={{
                      fontSize: 10,
                      cursor: "pointer",
                      background: "var(--surface)",
                      border: "1px solid var(--success-border)",
                      color: "var(--success-text)",
                      fontFamily: "inherit",
                      fontWeight: 600,
                      borderRadius: 4,
                      padding: "3px 8px",
                      width: "100%",
                    }}
                  >
                    {tr("boxplot.ctrl.switchLong")}
                  </button>
                </div>
              )}

              {/* Actions tile */}
              <ActionsPanel
                onDownloadSvg={onDownloadSvg}
                onDownloadPng={onDownloadPng}
                onReset={resetAll}
                extraDownloads={dataDownloads}
              />

              {/* Conditions / group color editor */}
              <ControlSection
                title={tr("boxplot.ctrl.conditions", {
                  sel: allDisplayGroups.filter((g: BoxplotGroup) => g.enabled).length,
                  total: allDisplayGroups.length,
                })}
                defaultOpen
              >
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--text-faint)" }}>
                  {tr("boxplot.ctrl.selectedObs", {
                    sel: allDisplayGroups.filter((g: BoxplotGroup) => g.enabled).length,
                    total: allDisplayGroups.length,
                    obs: renamedRows.length,
                  })}
                </p>
                <DiscretePaletteRow
                  value={vis.discretePalette || "okabe-ito"}
                  onChange={handlePaletteChange}
                  names={allDisplayGroups.map((g: BoxplotGroup) => g.name)}
                />
                <GroupColorEditor
                  groups={allDisplayGroups}
                  onColorChange={handleColorChange}
                  onNameChange={handleNameChange}
                  onToggle={onToggleGroup}
                />
              </ControlSection>
            </>
          ),
        },
        {
          id: "style",
          label: tr("boxplot.tab.style"),
          content: (
            <>
              {/* Plot style — always visible */}
              <div
                className="dv-panel"
                style={{ padding: 12, display: "flex", flexDirection: "column", gap: 9 }}
              >
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.plotStyle")}</div>
                  <PlotStyleIconPicker
                    value={vis.plotStyle}
                    onChange={(v) => updVis({ plotStyle: v })}
                    ariaLabel={tr("boxplot.ctrl.plotStyle")}
                    options={[
                      { value: "box", label: tr("boxplot.ctrl.style.box"), icon: <BoxStyleIcon /> },
                      {
                        value: "violin",
                        label: tr("boxplot.ctrl.style.violin"),
                        icon: <ViolinStyleIcon />,
                      },
                      {
                        value: "raincloud",
                        label: tr("boxplot.ctrl.style.rain"),
                        icon: <RaincloudStyleIcon />,
                      },
                      { value: "bar", label: tr("boxplot.ctrl.style.bar"), icon: <BarStyleIcon /> },
                    ]}
                  />
                </div>
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.orientation")}</div>
                  <OnOffToggle
                    value={vis.horizontal}
                    onChange={(v) => updVis({ horizontal: v })}
                    offLabel={tr("boxplot.ctrl.vertical")}
                    onLabel={tr("boxplot.ctrl.horizontal")}
                    ariaLabel={tr("boxplot.ctrl.orientation")}
                  />
                </div>
              </div>

              {/* Shape & fill */}
              <ControlSection title={tr("boxplot.ctrl.shapeFill")} defaultOpen>
                <BaseStyleControls
                  plotBg={vis.plotBg}
                  onPlotBgChange={sv("plotBg")}
                  showGrid={vis.showGrid}
                  onShowGridChange={sv("showGrid")}
                  gridColor={vis.gridColor}
                  onGridColorChange={sv("gridColor")}
                />
                <SliderControl
                  label={
                    vis.plotStyle === "box"
                      ? tr("boxplot.ctrl.boxWidth")
                      : vis.plotStyle === "bar"
                        ? tr("boxplot.ctrl.barWidth")
                        : tr("boxplot.ctrl.width")
                  }
                  value={vis.boxWidth}
                  displayValue={vis.boxWidth + "%"}
                  min={20}
                  max={100}
                  step={5}
                  onChange={sv("boxWidth")}
                />
                <SliderControl
                  label={
                    vis.plotStyle === "box"
                      ? tr("boxplot.ctrl.boxGap")
                      : vis.plotStyle === "bar"
                        ? tr("boxplot.ctrl.barGap")
                        : tr("boxplot.ctrl.gap")
                  }
                  value={vis.boxGap}
                  displayValue={vis.boxGap + "%"}
                  min={0}
                  max={80}
                  step={5}
                  onChange={sv("boxGap")}
                />
                {vis.plotStyle === "bar" ? (
                  <>
                    <SliderControl
                      label={tr("boxplot.ctrl.fillOpacity")}
                      value={vis.barOpacity}
                      displayValue={vis.barOpacity.toFixed(2)}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={sv("barOpacity")}
                    />
                    <div>
                      <div className="dv-label">{tr("boxplot.ctrl.errorBars")}</div>
                      <SegToggle<string>
                        ariaLabel={tr("boxplot.ctrl.errorBars")}
                        value={vis.errorType}
                        onChange={(v) => updVis({ errorType: v })}
                        options={[
                          { value: "none", label: tr("boxplot.ctrl.none") },
                          { value: "sem", label: "SEM" },
                          { value: "sd", label: "SD" },
                          { value: "ci95", label: "95% CI" },
                        ]}
                      />
                    </div>
                    {vis.errorType !== "none" && (
                      <SliderControl
                        label={tr("boxplot.ctrl.errStroke")}
                        value={vis.errStrokeWidth}
                        displayValue={vis.errStrokeWidth.toFixed(1)}
                        min={0.5}
                        max={4}
                        step={0.1}
                        onChange={sv("errStrokeWidth")}
                      />
                    )}
                    <div>
                      <div className="dv-label">{tr("boxplot.ctrl.barOutline")}</div>
                      <OnOffToggle
                        value={vis.showBarOutline}
                        onChange={(v) => updVis({ showBarOutline: v })}
                        ariaLabel={tr("boxplot.ctrl.barOutline")}
                      />
                    </div>
                    {vis.showBarOutline && (
                      <>
                        <SliderControl
                          label={tr("boxplot.ctrl.outlineWidth")}
                          value={vis.barOutlineWidth}
                          displayValue={vis.barOutlineWidth.toFixed(1)}
                          min={0.5}
                          max={4}
                          step={0.1}
                          onChange={sv("barOutlineWidth")}
                        />
                        <div>
                          <div className="dv-label">{tr("boxplot.ctrl.outlineColor")}</div>
                          <ColorInput
                            value={vis.barOutlineColor}
                            onChange={sv("barOutlineColor")}
                            size={24}
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <SliderControl
                      label={tr("boxplot.ctrl.fillOpacity")}
                      value={vis.boxFillOpacity}
                      displayValue={vis.boxFillOpacity.toFixed(2)}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={sv("boxFillOpacity")}
                    />
                    <div>
                      <div className="dv-label">{tr("boxplot.ctrl.boxCorners")}</div>
                      <SegToggle<string>
                        ariaLabel={tr("boxplot.ctrl.boxCorners")}
                        value={vis.boxCorners}
                        onChange={(v) => updVis({ boxCorners: v })}
                        options={[
                          { value: "rounded", label: tr("boxplot.ctrl.cornersRounded") },
                          { value: "square", label: tr("boxplot.ctrl.cornersSquare") },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="dv-label">{tr("boxplot.ctrl.boxOutline")}</div>
                      <SegToggle<string>
                        ariaLabel={tr("boxplot.ctrl.boxOutline")}
                        value={vis.boxOutline}
                        onChange={(v) => updVis({ boxOutline: v })}
                        options={[
                          { value: "group", label: tr("boxplot.ctrl.outlineGroup") },
                          { value: "custom", label: tr("boxplot.ctrl.outlineCustom") },
                        ]}
                      />
                    </div>
                    {vis.boxOutline === "custom" && (
                      <div>
                        <div className="dv-label">{tr("boxplot.ctrl.outlineColor")}</div>
                        <ColorInput
                          value={vis.boxOutlineColor}
                          onChange={sv("boxOutlineColor")}
                          size={24}
                        />
                      </div>
                    )}
                  </>
                )}
              </ControlSection>

              {/* Data points */}
              <ControlSection title={tr("boxplot.ctrl.dataPoints")}>
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.showPoints")}</div>
                  <OnOffToggle
                    value={vis.showPoints}
                    onChange={(v) => updVis({ showPoints: v })}
                    ariaLabel={tr("boxplot.ctrl.showPoints")}
                  />
                </div>
                {vis.showPoints && (
                  <>
                    {vis.plotStyle !== "bar" && (
                      <div>
                        <div className="dv-label">{tr("boxplot.ctrl.markOutliers")}</div>
                        <OnOffToggle
                          value={vis.markOutliers}
                          onChange={(v) => updVis({ markOutliers: v })}
                          ariaLabel={tr("boxplot.ctrl.markOutliers")}
                        />
                      </div>
                    )}
                    <div>
                      <div className="dv-label">{tr("boxplot.ctrl.colorBy")}</div>
                      <select
                        aria-label={tr("boxplot.ctrl.colorBy")}
                        value={colorByCol}
                        onChange={handleColorByChange}
                        className="dv-input"
                        style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
                      >
                        <option value={-1}>{tr("boxplot.ctrl.noneOption")}</option>
                        {colorByCandidates.map((ci: number) => (
                          <option key={ci} value={ci}>
                            {colNames[ci]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {colorByCol >= 0 && (
                      <div>
                        <div className="dv-label">{tr("boxplot.ctrl.compPies")}</div>
                        <OnOffToggle
                          value={vis.showCompPie}
                          onChange={(v) => updVis({ showCompPie: v })}
                          ariaLabel={tr("boxplot.ctrl.compPies")}
                        />
                      </div>
                    )}
                    {colorByCol >= 0 && vis.showCompPie && compositionTables.length > 0 && (
                      <div>
                        <div className="dv-label">{tr("boxplot.ctrl.compTest")}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {compositionTables.map((t, i) => {
                            const ok = isCompositionTestable(t);
                            return (
                              <button
                                key={t.facet ?? "_flat"}
                                type="button"
                                className="dv-btn dv-btn-secondary"
                                data-testid="comp-to-proportions"
                                disabled={!ok}
                                onClick={() => onSendComposition(i)}
                                title={tr(
                                  ok
                                    ? "boxplot.ctrl.compToProportionsTitle"
                                    : "boxplot.ctrl.compNotTestable"
                                )}
                                style={{ fontSize: 11, textAlign: "left" }}
                              >
                                {t.facet === null
                                  ? tr("boxplot.ctrl.compToProportions")
                                  : tr("boxplot.ctrl.compToProportionsFacet", { facet: t.facet })}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {colorByCol >= 0 && (
                      <DiscretePaletteRow
                        value={vis.categoryPalette || "okabe-ito"}
                        onChange={handleCategoryPaletteChange}
                        names={colorByCategories}
                      />
                    )}
                    {colorByCol >= 0 &&
                      colorByCategories.map((cat: string) => (
                        <div
                          key={cat}
                          style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}
                        >
                          <ColorInput
                            value={categoryColors[cat] || "#999999"}
                            onChange={(c) =>
                              setCategoryColors((p: Record<string, string>) => ({ ...p, [cat]: c }))
                            }
                            size={16}
                          />
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{cat}</span>
                        </div>
                      ))}
                    <SliderControl
                      label={tr("boxplot.ctrl.size")}
                      value={vis.pointSize}
                      displayValue={vis.pointSize}
                      min={1}
                      max={6}
                      step={0.5}
                      onChange={sv("pointSize")}
                    />
                    <SliderControl
                      label={tr("boxplot.ctrl.jitter")}
                      value={vis.jitterWidth}
                      displayValue={vis.jitterWidth.toFixed(2)}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={sv("jitterWidth")}
                    />
                    <SliderControl
                      label={tr("boxplot.ctrl.opacity")}
                      value={vis.pointOpacity}
                      displayValue={vis.pointOpacity.toFixed(2)}
                      min={0.1}
                      max={1}
                      step={0.05}
                      onChange={sv("pointOpacity")}
                    />
                  </>
                )}
              </ControlSection>
            </>
          ),
        },
        {
          id: "facets",
          label: tr("boxplot.tab.facets"),
          content: (
            <>
              {/* Split by — two plain selects mirror the column-role picker
          pattern used by scatter + lineplot's Variables panel. Facet and
          subgroup are independent: each filters the other's pool so the
          same column can't drive both axes (degenerate — every facet would
          contain a single subgroup). When both are active, each facet
          renders as its own chart with subgroup bands inside. */}
              <ControlSection title={tr("boxplot.ctrl.splitBy")}>
                <label style={{ display: "block" }}>
                  <span className="dv-label">{tr("boxplot.ctrl.facetBy")}</span>
                  <select
                    aria-label={tr("boxplot.ctrl.facetBy")}
                    value={facetByCol >= 0 ? facetByCol : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFacetByCol(raw === "" ? -1 : Number(raw));
                    }}
                    className="dv-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">{tr("boxplot.ctrl.noneParen")}</option>
                    {colorByCandidates
                      .filter((ci: number) => ci !== subgroupByCol)
                      .map((ci: number) => (
                        <option key={ci} value={ci}>
                          {colNames[ci]}
                        </option>
                      ))}
                  </select>
                </label>
                <label style={{ display: "block" }}>
                  <span className="dv-label">{tr("boxplot.ctrl.subgroupBy")}</span>
                  <select
                    aria-label={tr("boxplot.ctrl.subgroupBy")}
                    value={subgroupByCol >= 0 ? subgroupByCol : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setSubgroupByCol(raw === "" ? -1 : Number(raw));
                    }}
                    className="dv-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">{tr("boxplot.ctrl.noneParen")}</option>
                    {colorByCandidates
                      .filter((ci: number) => ci !== facetByCol)
                      .map((ci: number) => (
                        <option key={ci} value={ci}>
                          {colNames[ci]}
                        </option>
                      ))}
                  </select>
                </label>
              </ControlSection>
            </>
          ),
        },
        {
          id: "axes",
          label: tr("boxplot.tab.axes"),
          content: (
            <>
              {/* Axes & labels */}
              <ControlSection title={tr("boxplot.ctrl.axesLabels")}>
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.title")}</div>
                  <input
                    aria-label={tr("boxplot.ctrl.title")}
                    value={vis.plotTitle}
                    onChange={(e) => updVis({ plotTitle: e.target.value })}
                    className="dv-input"
                    style={{ width: "100%", fontSize: 11 }}
                  />
                </div>
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.yLabel")}</div>
                  <input
                    aria-label={tr("boxplot.ctrl.yLabel")}
                    value={vis.yLabel}
                    onChange={(e) => updVis({ yLabel: e.target.value })}
                    className="dv-input"
                    style={{ width: "100%", fontSize: 11 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="dv-label">{tr("boxplot.ctrl.yMin")}</div>
                    <input
                      aria-label={tr("boxplot.ctrl.yMin")}
                      value={vis.yMinCustom}
                      onChange={(e) => updVis({ yMinCustom: e.target.value })}
                      className="dv-input"
                      style={{ width: "100%", fontSize: 11 }}
                      placeholder={tr("boxplot.ctrl.auto")}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="dv-label">{tr("boxplot.ctrl.yMax")}</div>
                    <input
                      aria-label={tr("boxplot.ctrl.yMax")}
                      value={vis.yMaxCustom}
                      onChange={(e) => updVis({ yMaxCustom: e.target.value })}
                      className="dv-input"
                      style={{ width: "100%", fontSize: 11 }}
                      placeholder={tr("boxplot.ctrl.auto")}
                    />
                  </div>
                </div>
                <div>
                  <div className="dv-label">{tr("boxplot.ctrl.yScale")}</div>
                  <SegToggle<string>
                    ariaLabel={tr("boxplot.ctrl.yScale")}
                    value={vis.yScale || "linear"}
                    onChange={(v) => updVis({ yScale: v })}
                    options={[
                      { value: "linear", label: tr("boxplot.ctrl.linear") },
                      { value: "log10", label: "Log\u2081\u2080" },
                      { value: "log2", label: "Log\u2082" },
                      { value: "ln", label: "Ln" },
                    ]}
                  />
                </div>
                <SliderControl
                  label={tr("boxplot.ctrl.groupLabelAngle")}
                  value={vis.xLabelAngle}
                  displayValue={vis.xLabelAngle + "°"}
                  min={-90}
                  max={0}
                  step={5}
                  onChange={sv("xLabelAngle")}
                />
                <SliderControl
                  label={tr("boxplot.ctrl.tickFontSize")}
                  value={vis.tickFontSize}
                  displayValue={vis.tickFontSize + " px"}
                  min={11}
                  max={22}
                  step={1}
                  onChange={sv("tickFontSize")}
                />
              </ControlSection>
            </>
          ),
        },
      ]}
    />
  );
}
