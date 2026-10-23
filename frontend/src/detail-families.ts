// MICRO-FILTRI-DETTAGLIATI · the families of the «Detail level» panel.
//
// The datamodels do not group edge types at all (`edge_types` is a flat dict),
// and their node sections (stratigraphic_nodes, paradata_nodes, …) are too
// coarse for a filter: one section holds the real units, the virtual ones, the
// special finds and the BR. So the grouping is THIS table, and only the grouping:
// which node types and edge types exist, their labels in the interface's
// language and their descriptions are read from the datamodels (rules.ts). A
// node CLASS or an edge TYPE the datamodel adds and this table does not name
// lands in «Other», visible in the panel with its own label, and
// `check-detail-families` fails until it is placed here.
//
// Nodes are placed by CLASS: a node type goes to the family of the nearest class
// of its ancestry that the table names (so a new subclass of StratigraphicUnit
// follows its parent without a row here). Edges are placed by NAME.
//
// Two things per family besides the members:
// - `structural`: types that carry the drawing's structure (the containers'
//   membership edges, the group boxes, the epochs that are the Matrix's lanes).
//   They are counted and listed but never switched off — as before this change,
//   when they had no ring at all.
// - the default per view: `matrix` / `graph` for the family, `matrixExcept` for
//   the types whose Matrix default is the opposite one. The defaults are those of
//   the rings this table replaced, type by type (measured in the report): the
//   Matrix shows the units, the paradata and the ornaments, not the outer ring.

export type NodeFamilyKey =
  | "units_real"
  | "units_virtual"
  | "special_finds"
  | "continuity"
  | "epochs"
  | "documents"
  | "extractors"
  | "combiners"
  | "properties"
  | "groups"
  | "models"
  | "resources"
  | "georef"
  | "rights"
  | "dtc"
  | "narrative"
  | "hdto"
  | "other";

export type EdgeFamilyKey =
  | "stratigraphic"
  | "temporal"
  | "containment"
  | "pd_properties"
  | "pd_extractors"
  | "pd_combiners"
  | "pd_sources"
  | "pd_groups"
  | "representation"
  | "georef"
  | "rights"
  | "dtc"
  | "narrative"
  | "hdto"
  | "other"
  | "generic";

export interface NodeFamilyDef {
  key: NodeFamilyKey;
  /** datamodel class names; a type belongs to the family of its nearest named ancestor */
  classes: string[];
  /** classes (and their subclasses) that are structure: listed, never switched off */
  structural?: string[];
  matrix: boolean;
  graph: boolean;
  /** node types whose Matrix default is the opposite of `matrix` */
  matrixExcept?: string[];
}

export interface EdgeFamilyDef {
  key: EdgeFamilyKey;
  edges: string[];
  structural?: string[];
  matrix: boolean;
  graph: boolean;
  matrixExcept?: string[];
}

// Order = the panel's order: the units first, then time, the paradata, the outer ring.
export const NODE_FAMILY_TABLE: NodeFamilyDef[] = [
  {
    key: "units_real",
    classes: [
      "StratigraphicNode", "StratigraphicUnit", "NegativeStratigraphicUnit",
      "NeutralStratigraphicUnit", "SeriesOfStratigraphicUnit", "StratigraphicEventNode",
      "TransformationStratigraphicUnit", "WorkingUnit", "UnknownNode",
    ],
    matrix: true, graph: true,
  },
  {
    key: "units_virtual",
    classes: [
      "VirtualStratigraphicUnit", "SeriesOfNonStructuralVirtualStratigraphicUnit",
      "SeriesOfStructuralVirtualStratigraphicUnit", "DocumentaryStratigraphicUnit",
      "SeriesOfDocumentaryStratigraphicUnit",
    ],
    matrix: true, graph: true,
  },
  {
    key: "special_finds",
    classes: ["SpecialFindUnit", "ReusedSpecialFind", "VirtualSpecialFindUnit", "SeriesOfVirtualSpecialFindUnit"],
    matrix: true, graph: true,
  },
  { key: "continuity", classes: ["ContinuityNode"], matrix: true, graph: true },
  // the epochs are the Matrix's lanes: never a filtered node
  { key: "epochs", classes: ["EpochNode"], structural: ["EpochNode"], matrix: true, graph: true },
  // the abstract ParadataNode (a paradata node of no kind) sits with the sources
  { key: "documents", classes: ["ParadataNode", "DocumentNode"], matrix: true, graph: true },
  { key: "extractors", classes: ["ExtractorNode"], matrix: true, graph: true },
  { key: "combiners", classes: ["CombinerNode"], matrix: true, graph: true },
  { key: "properties", classes: ["PropertyNode"], matrix: true, graph: true },
  {
    key: "groups",
    classes: [
      "GroupNode", "ActivityNodeGroup", "LocationNodeGroup", "TimeBranchNodeGroup",
      "FunctionalUnitNodeGroup", "ParadataNodeGroup", "RepresentationModelNodeGroup",
    ],
    // a ParadataNodeGroup IS paradata (it hid with the paradata ring); the other
    // boxes hold stratigraphic content and are the drawing's structure
    structural: [
      "GroupNode", "ActivityNodeGroup", "LocationNodeGroup", "TimeBranchNodeGroup",
      "FunctionalUnitNodeGroup", "RepresentationModelNodeGroup",
    ],
    matrix: true, graph: true,
  },
  {
    key: "models",
    classes: [
      "RepresentationNode", "RepresentationModelNode", "RepresentationModelDocNode",
      "RepresentationModelSpecialFindNode", "SemanticShapeNode", "AnnotationRegionNode",
    ],
    matrix: false, graph: true,
  },
  { key: "resources", classes: ["ResourceNode", "ResourceFileNode"], matrix: false, graph: true },
  {
    key: "georef",
    classes: ["GeoPositionNode", "RegistrationTransformNode", "GCPSetNode"],
    matrix: false, graph: true,
  },
  {
    key: "rights",
    classes: ["AuthorNode", "AuthorAINode", "LicenseNode", "EmbargoNode"],
    matrix: true, graph: true,
  },
  {
    key: "dtc",
    classes: ["DTCNode", "DTCProcessNode", "DTCAcquisitionNode", "DTCDeviceNode"],
    matrix: false, graph: true,
  },
  { key: "narrative", classes: ["NarrativeNode", "TranslationNode"], matrix: false, graph: true },
  {
    key: "hdto",
    classes: ["GraphNode", "HDTNode", "HeritageEntityNode", "ProjectNode", "StudyNode"],
    matrix: false, graph: true,
  },
  // what no row names: Node itself, a class the datamodel adds, a type it does not know
  { key: "other", classes: ["Node"], matrix: false, graph: true },
];

export const EDGE_FAMILY_TABLE: EdgeFamilyDef[] = [
  // the physical relations and the sequence between units — the Harris matrix
  {
    key: "stratigraphic",
    edges: [
      "is_after", "overlies", "cuts", "fills", "abuts",
      "is_bonded_to", "bonded_to", "is_physically_equal_to", "equals",
    ],
    matrix: true, graph: true,
  },
  // time: the epochs, the contemporaneity, one object's instances across the epochs.
  // In the Matrix the epochs are the lanes, so their edges are not drawn there.
  {
    key: "temporal",
    edges: ["has_first_epoch", "survive_in_epoch", "has_sub_epoch", "has_same_time", "changed_from"],
    matrix: true, graph: true,
    matrixExcept: ["has_first_epoch", "survive_in_epoch", "has_sub_epoch"],
  },
  // what is part of what: containers, functional units, activities, places,
  // the time branches (alternative hypotheses) and the groups of models
  {
    key: "containment",
    edges: [
      "is_part_of", "is_in_functional_unit", "is_in_activity", "is_in_location",
      "is_in_timebranch", "has_timebranch", "contrasts_with", "is_in_representation_model_group",
    ],
    structural: ["is_part_of", "is_in_activity", "is_in_location", "is_in_timebranch"],
    matrix: true, graph: true,
    matrixExcept: ["contrasts_with", "is_in_representation_model_group"],
  },
  { key: "pd_properties", edges: ["has_property", "has_data_provenance"], matrix: true, graph: true },
  { key: "pd_extractors", edges: ["extracted_from"], matrix: true, graph: true },
  { key: "pd_combiners", edges: ["combines"], matrix: true, graph: true },
  { key: "pd_sources", edges: ["has_documentation"], matrix: true, graph: true },
  {
    key: "pd_groups",
    edges: ["has_paradata_nodegroup", "is_in_paradata_nodegroup"],
    structural: ["is_in_paradata_nodegroup"],
    matrix: true, graph: true,
  },
  {
    key: "representation",
    edges: [
      "has_representation_model", "has_representation_model_doc", "has_representation_model_sf",
      "has_semantic_shape", "has_linked_resource", "has_file", "was_revision_of",
      "has_visual_reference", "is_on_resource",
    ],
    matrix: false, graph: true,
  },
  { key: "georef", edges: ["has_geoposition", "has_registration_transform", "has_gcp_set"], matrix: false, graph: true },
  { key: "rights", edges: ["has_author", "has_license", "has_embargo"], matrix: false, graph: true },
  {
    key: "dtc",
    edges: ["dtc_had_input", "dtc_had_output", "dtc_happened_on_device", "dtc_derived_from"],
    matrix: false, graph: true,
  },
  { key: "narrative", edges: ["has_translation", "validated_by"], matrix: false, graph: true },
  {
    key: "hdto",
    edges: [
      "has_digital_twin", "has_digital_twin_component", "contains_proposition_set",
      "has_digital_object_part", "includes_study", "study_about_heritage",
      "study_produced_proposition_set", "study_took_place_at", "heritage_part_of",
    ],
    matrix: false, graph: true,
  },
  // what no row names: an edge type the datamodel adds, a spelling it does not know
  { key: "other", edges: [], matrix: false, graph: true },
  { key: "generic", edges: ["generic_connection"], matrix: false, graph: true },
];

/** Templates of the panel, said by families plus single types — `leaves` of
 *  the Detail panel (filters.ts expands them). Each of the four first ones shows
 *  exactly what its ring-set showed before this table (check-detail-families). */
export interface TemplateDef {
  key: string;
  /** i18n key of the label */
  label: string;
  nodeFamilies: NodeFamilyKey[];
  edgeFamilies: EdgeFamilyKey[];
  nodeTypes?: string[];
  edgeTypes?: string[];
}

export const TEMPLATE_TABLE: TemplateDef[] = [
  {
    key: "full",
    label: "fam.tpl.full",
    nodeFamilies: NODE_FAMILY_TABLE.map((f) => f.key),
    edgeFamilies: EDGE_FAMILY_TABLE.map((f) => f.key),
  },
  {
    // the units (with the special finds and the documentary units the ring held),
    // the BR, the sequence; and the edges that ring held besides: contemporaneity,
    // instances, functional units, time branches
    key: "harris",
    label: "fam.tpl.harris",
    nodeFamilies: ["units_real", "continuity"],
    edgeFamilies: ["stratigraphic"],
    nodeTypes: ["SF", "RSF", "USD", "serUSD"],
    edgeTypes: ["has_same_time", "changed_from", "is_in_functional_unit", "has_timebranch"],
  },
  {
    key: "em-compact",
    label: "fam.tpl.emCompact",
    nodeFamilies: ["units_real", "units_virtual", "special_finds", "continuity"],
    edgeFamilies: ["stratigraphic"],
    edgeTypes: ["has_same_time", "changed_from", "is_in_functional_unit", "has_timebranch"],
  },
  {
    key: "em-complete",
    label: "fam.tpl.emComplete",
    nodeFamilies: [
      "units_real", "units_virtual", "special_finds", "continuity",
      "documents", "extractors", "combiners", "properties", "groups",
    ],
    edgeFamilies: ["stratigraphic", "pd_properties", "pd_extractors", "pd_combiners", "pd_sources", "pd_groups"],
    edgeTypes: ["has_same_time", "changed_from", "is_in_functional_unit", "has_timebranch"],
  },
];
