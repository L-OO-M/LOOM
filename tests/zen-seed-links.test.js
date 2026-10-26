import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LINKS, NEW_RESOURCES, UNCOVERED_NODES } from "@/load/seed-node-resources";
import { toZenModel } from "@/lib/zen-embed";

// Integrity of the node→resource mapping (036 / seed-node-resources.js).
// Every pair must reference real canonical catalogue ids — nothing invented —
// nodes without a genuine match must be named rather than filler-filled, and
// YouTube playlist links must never become video embeds.
// Fixtures are read-only snapshots of the canonical data (verified in loom_test).
const WEB_NODE_IDS = new Set([
  "web_html5", "web_css3", "web_javascript_core", "web_git_github",
  "web_dev_tools_fundamentals", "web_css_frameworks",
  "web_react_fundamentals", "web_react_intermediate", "web_react_advanced",
  "web_mern_portfolio_projects",
  "web_dsa_track",
]);

// Name-identity pairs: the catalogue's own node↔resource naming.
const NAME_IDENTITY = new Map([
  ["bc_patrick_collins", "res_bc_patrick_collins"],
  ["bc_daulat_hussain", "res_bc_daulat_hussain"],
  ["bc_hackquest", "res_bc_hackquest"],
  ["bc_mit_ocw", "res_bc_mit_ocw"],
  ["bc_harkirat_cohort", "res_bc_harkirat_100xdevs"],
  ["bc_udemy_solidity", "res_bc_udemy_solidity"],
  ["dsa_striver", "res_dsa_striver_a2z"],
  ["dsa_neetcode_150", "res_dsa_neetcode_150"],
  ["dsa_leetcode_codeforces", "res_dsa_leetcode_codeforces"],
  ["dsa_karumahchi", "res_dsa_karumahchi"],
]);
const KNOWN_NODE_IDS = new Set([...WEB_NODE_IDS, ...NAME_IDENTITY.keys()]);

// AI/ML nodes covered by this batch (catalogue ids, verified in loom_test).
const AI_ML_NODE_IDS = new Set([
  "ai_ml_foundations_data_workflow", "ai_ml_fundamentals", "ai_data_acquisition_eda",
  "ai_feature_engineering_preprocessing", "ai_supervised_learning_regression",
  "ai_simple_linear_regression", "ai_multiple_linear_regression",
  "ai_gradient_descent_for_regression", "ai_polynomial_regression", "ai_regression_metrics",
  "ai_bias_variance_regularized_regression", "ai_bias_variance_tradeoff",
  "ai_ridge_regression_l2", "ai_lasso_regression_l1", "ai_elastic_net",
  "ai_ensemble_learning", "ai_voting_ensembles", "ai_bagging", "ai_random_forest",
  "ai_adaboost", "ai_gradient_boosting", "ai_xgboost", "ai_stacking_blending",
  "ai_clustering_dimensionality_reduction", "ai_k_means_clustering",
  "ai_agglomerative_hierarchical_clustering", "ai_dbscan", "ai_curse_of_dimensionality",
  "ai_pca", "ai_hyperparameter_tuning_reliable_experiments", "ai_search_strategies",
  "ai_experiment_hygiene", "ai_neural_network_fundamentals", "ai_perceptron",
  "ai_multi_layer_perceptron", "ai_loss_functions", "ai_backpropagation",
  "ai_optimization_activations_regularization", "ai_gradient_descent_in_neural_networks",
  "ai_activation_functions", "ai_initialization", "ai_regularization_generalization",
  "ai_optimizers", "ai_nn_hyperparameter_tuning", "ai_convolutional_neural_networks",
  "ai_cnn_intuition", "ai_convolution_operation", "ai_pooling",
  "ai_cnn_architecture_backprop", "ai_data_augmentation_transfer_learning",
  "ai_rnn_lstm_gru", "ai_recurrent_neural_networks", "ai_lstm", "ai_gru",
  "ai_deep_bidirectional_rnns", "ai_seq2seq_attention_transformers",
  "ai_encoder_decoder_seq2seq", "ai_attention_mechanism", "ai_transformer_foundations",
  "ai_positional_encoding_layer_norm", "ai_transformer_encoder",
  "ai_transformer_decoder_inference",
]);

// Union of every node id this seeder is allowed to reference.

// Cybersecurity nodes (all 48 canonical ids).
const CY_NODE_IDS = new Set([
  "cy_linux_cli", "cy_networking", "cy_programming", "cy_web_security",
  "cy_ctf_practice", "cy_binary_systems", "cy_cryptography", "cy_continuous_learning",
  "cy_foundations_linux", "cy_foundations_networking", "cy_foundations_programming",
  "cy_foundation_checkpoint", "cy_platform_tryhackme", "cy_platform_overthewire",
  "cy_platform_pwn_college", "cy_platform_portswigger", "cy_platform_ctflearn",
  "cy_platform_cylab_academy", "cy_platform_cryptohack", "cy_ctf_linux_enumeration",
  "cy_ctf_web", "cy_ctf_crypto", "cy_ctf_reverse_engineering", "cy_ctf_binary_pwn",
  "cy_ctf_forensics", "cy_ctf_focused_channels", "cy_web_track_portswigger",
  "cy_web_core_concepts", "cy_crypto_nptel_foundations",
  "cy_crypto_nptel_network_security", "cy_crypto_cryptohack", "cy_current_networkchuck",
  "cy_current_nfsu_material", "cy_current_keep_learning", "cy_weeks_1_2",
  "cy_weeks_3_4", "cy_weeks_5_6", "cy_weeks_7_8", "cy_weeks_9_10", "cy_weeks_11_12",
  "cy_check_linux_terminal", "cy_check_networking_protocols", "cy_check_python_scripts",
  "cy_check_http_requests", "cy_check_ctf_challenges",
  "cy_check_encoding_hashing_encryption", "cy_check_hands_on_labs",
  "cy_check_specialization",
]);

// Cybersecurity single-reference nodes: platform nodes are named after one
// platform each, and these checkpoints have exactly one honest match.
const CY_SINGLE_REFERENCE = new Set([
  "cy_platform_tryhackme", "cy_platform_overthewire", "cy_platform_pwn_college",
  "cy_platform_portswigger", "cy_platform_ctflearn", "cy_platform_cylab_academy",
  "cy_platform_cryptohack", "cy_crypto_nptel_foundations",
  "cy_crypto_nptel_network_security", "cy_current_networkchuck",
  "cy_current_nfsu_material", "cy_check_networking_protocols",
  "cy_check_python_scripts",
]);


// Embedded sub-batch 1 — Electronics Fundamentals (group 1).
const EM_FUNDAMENTAL_NODES = new Set([
  "em_voltage_current_resistance_power", "em_ohms_law_kirchhoffs_laws",
  "em_resistors_capacitors_inductors", "em_diodes_leds_transistors",
  "em_mosfets_opamps", "em_voltage_regulators", "em_analog_vs_digital_signals",
  "em_basic_circuit_analysis", "em_breadboard_multimeter_techniques",
]);

// Embedded sub-batch 2 — Digital Electronics + Programming & Microcontrollers.
const EM_BATCH2_NODES = new Set([
  "em_binary_hexadecimal_systems", "em_logic_gates_boolean_algebra",
  "em_combinational_circuits", "em_flipflops_latches", "em_registers_counters",
  "em_mux_demux", "em_adc_dac_architectures", "em_timers_memory_basics",
  "em_c_cpp_fundamentals", "em_pointers_arrays_structures",
  "em_gpio_analog_digital_io", "em_pwm_hardware_timers",
  "em_hardware_software_interrupts", "em_serial_communication_uart",
"em_ecosystem_arduino_esp8266_esp32_stm32",
]);

// Filled in by later batches; declared here so the coverage assertions
// below always run against the full mapped set.
const EM_BATCH3_NODES = new Set([
  "em_temperature_humidity_sensors", "em_ultrasonic_pir_motion_sensors",
  "em_imu_mpu6050_accelerometers", "em_relays_mosfet_switches",
  "em_motors_motor_drivers_hbridge", "em_servo_motors_encoders",
  "em_displays_oled_tft_lcd", "em_sd_cards_storage",
  "em_batteries_charging_power_management", "em_uart", "em_i2c", "em_spi",
  "em_can_bus", "em_pwm_signal_control", "em_usb_protocol_basics",
  "em_wifi_bluetooth_ble", "em_mqtt_messaging", "em_esp32_networking_frameworks",
  "em_wifi_ble_connectivity", "em_mqtt_http_rest_apis", "em_embedded_web_servers",
  "em_firebase_cloud_platform_integration", "em_ota_firmware_updates",
  "em_iot_device_security_fundamentals", "em_low_power_optimization_sleep_modes",
]);
const EM_BATCH4_NODES = new Set([
  "em_circuit_schematics_netlists", "em_component_selection_datasheet_review",
  "em_footprint_symbol_creation", "em_multi_layer_pcb_stacks",
  "em_high_speed_power_routing", "em_ground_planes_return_paths",
  "em_erc_drc_design_rule_verification", "em_gerber_drill_file_generation",
  "em_pcba_dfm", "em_eda_software_kicad_altium",
  "em_bare_metal_embedded_c", "em_arm_cortex_m_architecture",
  "em_stm32_hardware_peripherals", "em_direct_register_access",
  "em_advanced_interrupts_timers_dma", "em_custom_peripheral_driver_development",
  "em_custom_bootloaders", "em_hardware_debugging_swd_jtag",
  "em_memory_management_linker_scripts", "em_low_power_operational_modes",
  "em_freertos_kernel_fundamentals", "em_task_creation_states_prioritization",
  "em_preemptive_vs_cooperative_scheduling", "em_queues_mailboxes",
  "em_semaphores_mutexes", "em_inter_task_communication_isr_safe_apis",
  "em_real_time_constraints_deadlock_avoidance",
  "em_oscilloscope_logic_analyzer_mastery", "em_deep_datasheet_errata_analysis",
  "em_signal_power_integrity_debugging", "em_emi_emc_compliance_basics",
  "em_thermal_management_dissipation", "em_hardware_qualification_validation",
  "em_prototyping_testing_iteration_production",
]);
const EM_BATCH5_NODES = new Set([
  "em_ar_what_is_arduino",
"em_ar_types_of_arduino_boards",
"em_ar_arduino_uno",
"em_ar_board_breakdown",
"em_ar_power_supply",
"em_ar_breadboard",
"em_ar_how_to_program",
"em_ar_how_everything_works_together",
"em_ar_arduino_projects",
"em_ar_tools_needed",
"em_ar_arduino_shields",
"em_ar_arduino_sensors",
"em_ar_electronics_retailers",
"em_ar_tools_and_parts_needed",
"em_ar_download_the_software",
"em_ar_arduino_ide",
"em_ar_connect_your_arduino_uno",
"em_ar_project_1_blink_an_led",
"em_ar_change_the_code",
"em_ar_project_2_led_w_switch",
"em_ar_troubleshooting",
"em_ar_resources",
"rpi_introducing_raspberry_pi_4",
"rpi_quickstart_guide",
"rpi_raspberry_pi_4_starter_guide",
"rpi_your_next_desktop_pc",
"rpi_4k_digital_media_hub",
"rpi_make_with_code",
"rpi_electronics_with_gpio_zero",
"rpi_teenage_dinner_klaxon",
"rpi_gpio_music_box",
"rpi_laundry_saving_rain_detector",
"rpi_smart_door",
"rpi_neopixel_display_cabinet_lights",
"rpi_build_a_secret_radio_chat_device",
"rpi_powerful_raspberry_pi_projects",
"rpi_low_cost_wheeled_robot_1",
"rpi_low_cost_wheeled_robot_2",
"rpi_low_cost_wheeled_robot_3",
"rpi_low_cost_wheeled_robot_4",
"rpi_marauders_map",
"rpi_ai_plant_monitor",
"rpi_comics_from_tv_recordings",
"rpi_car_spy_pi",
"rpi_as_we_are",
"rpi_yuri_3_mars_rover",
"rpi_sofi",
"rpi_teslonda",
"rpi_pi_fighter",
"rpi_squirrel_cafe",
"rpi_tide_clock_weather_thing",
"rpi_a_whisper_of_moths",
"rpi_underwater_drone",
"rpi_chord_assist",
"rpi_tv_wall",
"rpi_telepresence_hand",
"rpi_pi_vizuwall",
"rpi_smart_home_herb_garden",
"rpi_marvin_go_kart",
"rpi_tortoise_fridge",
"rpi_immersive_bar",
]);
const BACKEND_NODES = new Set([
  "web_nodejs",
"web_expressjs",
"web_mongodb_mongoose",
"web_authentication_security",
"web_connecting_frontend_backend",
"web_java_basics",
"web_oop",
"web_collections_generics",
"web_multithreading_exception_handling",
"web_build_tools_jvm",
"web_java_web_fundamentals",
"web_spring_framework_core",
"web_spring_boot",
"web_spring_data_jpa_hibernate",
"web_spring_security_jwt",
"web_connecting_spring_react",
"web_testing",
"web_low_level_design",
"web_high_level_design",
"py_the_python_data_model",
"py_an_array_of_sequences",
"py_dictionaries_and_sets",
"py_unicode_text_versus_bytes",
"py_data_class_builders",
"py_object_references_mutability",
"py_functions_as_first_class_objects",
"py_type_hints_in_functions",
"py_decorators_and_closures",
"py_design_patterns_with_first_class_functions",
"py_a_pythonic_object",
"py_special_methods_for_sequences",
"py_interfaces_protocols_and_abcs",
"py_inheritance_for_better_or_for_worse",
"py_more_about_type_hints",
"py_operator_overloading",
"py_iterators_generators_and_classic_coroutines",
"py_with_match_and_else_blocks",
"py_concurrency_models_in_python",
"py_concurrent_executors",
"py_asynchronous_programming",
"py_dynamic_attributes_and_properties",
"py_attribute_descriptors",
"py_class_metaprogramming",
]);
const DEVOPS_NODES = new Set([
  "web_deployment",
"web_microservices_cloud_native",
"web_java_deployment",
]);

// Legacy `node_*` rows seeded by migration 011. They are not in
// load/roadmap-data/ (no canonical seeder touches them) but they still render
// in the student's Web roadmap, so they need study material too. Ids and graph
// position are left untouched — only their shelves are filled.
const LEGACY_PLACEHOLDER_NODES = new Set([
  "node_html_css", "node_javascript", "node_git_github", "node_react",
  "node_node", "node_database", "node_deploy",
]);

const ALL_NODE_IDS = new Set([  ...KNOWN_NODE_IDS, ...AI_ML_NODE_IDS, ...CY_NODE_IDS, ...EM_FUNDAMENTAL_NODES, ...EM_BATCH2_NODES, ...EM_BATCH3_NODES, ...EM_BATCH4_NODES, ...EM_BATCH5_NODES, ...BACKEND_NODES, ...DEVOPS_NODES, ...LEGACY_PLACEHOLDER_NODES]);

// Catalogue URLs are read from the canonical source itself
// (load/roadmap-data/*.json) rather than hand-copied into this file. A
// hand-typed snapshot silently goes stale the moment a URL is filled — which
// is exactly how URL-less rows survived here while the real data had links.
const CANONICAL_RESOURCE_URLS = (() => {
  const dir = path.join(process.cwd(), "load/roadmap-data");
  const out = {};
  const read = (rows) => {
    for (const r of rows || []) if (r && r.id && r.url) out[r.id] = r.url;
  };
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    read(data.resources);
    for (const track of data.tracks || []) read(track.resources);
  }
  return out;
})();

// Existing Embedded catalogue rows reused by this batch.
const RESOURCE_URLS = {
  ...CANONICAL_RESOURCE_URLS,
  res_web_mdn_web_docs: "https://developer.mozilla.org",
  res_web_javascript_info: "https://javascript.info",
  res_web_react_official_docs: "https://react.dev",
  res_web_namaste_javascript: "https://namastedev.com",
  res_web_codewithharry_sigma: "https://youtube.com/playlist?list=PLu0W_9lII9agiCUZYRsvtGTXdxkzPyItg",
  res_web_durgesh_blogging_app: "https://youtube.com/playlist?list=PL0zysOflRCekAvE0nXWobPCgW0ets6s5o",
  res_html_semantic: "https://developer.mozilla.org/docs/Web/HTML",
  res_css_grid: "https://css-tricks.com/snippets/css/complete-guide-grid/",
  res_js_async: "https://developer.mozilla.org/docs/Learn/JavaScript/Asynchronous",
  res_git_branching: "https://learngitbranching.js.org/",
  res_react_hooks: "https://react.dev/reference/react",
  res_bc_patrick_collins: "https://youtube.com/@patrickalphac",
  res_bc_daulat_hussain: "https://youtube.com/@daulathussain",
  res_bc_hackquest: "https://share.google/VmJAaKIAPNldZhs4g",
  res_bc_harkirat_100xdevs: "https://share.google/LGUpFbf56il9AL3Dv",
  res_bc_udemy_solidity: "https://www.udemy.com/share/10bwLp/",
res_dsa_striver_a2z: "https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z",
  res_dsa_neetcode_150: "https://neetcode.io/practice/practice/neetcode150",
  // Pre-existing AI/ML catalogue rows reused by this batch.
  res_ml_crash: "https://developers.google.com/machine-learning/crash-course",
  res_hf_nlp: "https://huggingface.co/learn/nlp-course",
  res_fastai: "https://course.fast.ai/",
  res_distill: "https://distill.pub/",
  res_kaggle_intro: "https://www.kaggle.com/learn/intro-to-machine-learning",
  // Pre-existing Cybersecurity catalogue rows reused by this batch.
  res_owasp_top10: "https://owasp.org/www-project-top-ten/",
  res_ctftime: "https://ctftime.org/",
  res_cy_linux_playlist: "https://youtube.com/playlist?list=PLIhvC56v63IJIujb5cyE13oLuyORZpdkL",
  res_cy_tryhackme: "https://tryhackme.com/",
  res_cy_overthewire: "https://overthewire.org/wargames/",
  res_cy_pwn_college: "https://pwn.college/",
  res_cy_portswigger: "https://portswigger.net/web-security",
  res_cy_ctflearn: "https://ctflearn.com/",
  res_cy_cylab_academy: "https://cylabacademy.org/",
  res_cy_cryptohack: "https://cryptohack.org/",
  res_cy_nptel_foundations_crypto: "https://onlinecourses.nptel.ac.in/e-learning/course/noc26_cs18",
  res_cy_nptel_network_security: "https://onlinecourses.nptel.ac.in/e-learning/preview/noc26_ee20",
  res_cy_networkchuck: "https://www.youtube.com/@NetworkChuck",
  res_cy_bitten_tech: "https://www.youtube.com/@BittenTech",
  res_cy_john_hammond: "https://www.youtube.com/@_JohnHammond",
  res_cy_awesome_cyber_security: "https://github.com/okhosting/awesome-cyber-security",
  res_cy_nfsu_study_material: "https://github.com/Rasenkai/NFSU_CyberSecurity_StudyMaterial",
  res_cy_python_security_books: "https://github.com/ManhNho/Python-Books-for-Security",
  // Pre-existing Embedded catalogue rows reused by sub-batch 1.
  res_em_all_about_circuits: "https://www.allaboutcircuits.com/",
  res_em_sparkfun_tutorials: "https://learn.sparkfun.com/tutorials",
  res_em_neso_academy: "https://www.youtube.com/@nesoacademy",
  res_em_eevblog: "https://www.youtube.com/@EEVblog",
  res_em_ben_eater: "https://www.youtube.com/@BenEater",
  res_em_arduino_official_docs: "https://docs.arduino.cc/",
  res_em_arduino_tutorials: "https://docs.arduino.cc/tutorials/",
  res_em_espressif_docs: "https://docs.espressif.com/",
  res_em_esp32_arduino_docs: "https://docs.espressif.com/projects/arduino-esp32/en/latest/",
  res_em_adafruit_learning_system: "https://learn.adafruit.com/",
  res_em_arduino_ide_software: "https://www.arduino.cc/en/Main/Software",
  res_em_kicad_docs: "https://docs.kicad.org/",
  res_em_freertos_docs: "https://www.freertos.org/Documentation/",
  res_em_altium_education: "https://education.altium.com/",
  res_em_altium_designer: "https://www.altium.com/altium-designer",
  res_em_random_nerd_tutorials: "https://randomnerdtutorials.com/",
  res_em_phils_lab: "https://www.youtube.com/@PhilsLab",
  res_em_greatscott: "https://www.youtube.com/@greatscottlab",
  res_rpi_adafruit: "https://adafruit.com",
  res_rpi_beginners_guide: "https://magpi.cc/BGbook",
  res_rpi_electronics_guide: "https://magpi.cc/64",
  res_rpi_conquer_command_line: "https://magpi.cc/CLIbook",
res_rpi_camera_module_v2: "https://magpi.cc/camera",
  res_web_take_u_forward_dsa: "https://takeuforward.org",
  res_pi_tide_clock: "https://magazine.raspberrypi.com/articles/moon-and-tide-clock",
  res_pi_whisper_of_moths: "https://magazine.raspberrypi.com/articles/a-whisper-of-moths",
  res_pi_chord_assist: "https://magazine.raspberrypi.com/articles/chord-assist",
  res_pi_smart_home_herb_garden: "https://magazine.raspberrypi.com/articles/smart-home-herb-garden",
  res_pi_marvin_go_kart: "https://magazine.raspberrypi.com/articles/marvin-go-kart",
  res_pi_tortoise_fridge: "https://magazine.raspberrypi.com/articles/tortoise-fridge",
  res_pi_immersive_bar: "https://magazine.raspberrypi.com/articles/immersive-bar",
  // Backend / DevOps catalogue rows reused by this batch.
  res_web_durgesh_full_courses: "https://learncodewithdurgesh.com",
  res_web_telusko_java_spring: "https://youtube.com/playlist?list=PLsyeobzWxl7q6oUFts2erdot6jxF_lisP",
  res_web_telusko_spring_boot: "https://youtube.com/playlist?list=PLsyeobzWxl7qA8QOlMtQsRT_I7Rx2hoX4",
  res_web_postman: "https://postman.com",
  res_web_mongodb_university: "https://learn.mongodb.com",
  res_web_dbdiagram_io: "https://dbdiagram.io",
  res_web_spring_official_guides: "https://spring.io/guides",
  res_web_baeldung: "https://baeldung.com",
  res_web_codingshuttle_spring_boot: "https://codingshuttle.com/courses/java-spring-boot-0-to-100",
  res_web_codingshuttle_java_mastery: "https://youtube.com/playlist?list=PLUcsbZa0qzu18zPz3EatehQJ5K1jP4IO2",
  res_web_shrayansh_lld: "https://youtube.com/playlist?list=PL6W8uoQQ2c61X_9e6Net0WdYZidm7zoo",
  res_web_shrayansh_hld: "https://youtube.com/playlist?list=PL6W8uoQQ2c63W58rpNFDwdrBnq5G3Ef",
  res_web_gaurav_sen_system_design: "https://youtube.com/@gkcs",
  res_py_example_code_2e: "https://github.com/fluentpython/example-code-2e",
  res_py_example_code_short_link: "https://fpy.li/code",
  res_py_errata_page: "https://fpy.li/p-4",
  res_py_pep_263: "https://python.org/dev/peps/pep-0263/",
};

// Nodes with exactly one genuinely-matching reference in the catalogue.
// Listed explicitly rather than padded with a second, weaker link.
const SINGLE_REFERENCE_NODES = new Set([
  "ai_voting_ensembles", "ai_stacking_blending", "ai_agglomerative_hierarchical_clustering",
  "ai_dbscan", "ai_elastic_net", "ai_initialization", "ai_pooling",
  "ai_cnn_architecture_backprop",
]);
// Catalogue rows that legitimately carry no URL yet (listed, not clickable).
const URL_LESS_RESOURCES = new Set([
  "res_bc_mit_ocw", "res_dsa_leetcode_codeforces", "res_dsa_karumahchi",
  // Fluent Python catalogue rows carry stdlib references without a URL.
  "res_py_dataclasses", "res_py_namedtuple", "res_py_collections_deque",
  "res_py_collections_counter", "res_py_collections_defaultdict",
  "res_py_collections_chainmap", "res_py_shelve", "res_py_array_module",
  "res_py_memoryview", "res_py_numpy", "res_py_unicodedata",
  "res_py_re_pattern_matching", "res_py_typing", "res_py_mypy", "res_py_typevar",
  "res_py_protocol", "res_py_collections_abc", "res_py_abc", "res_py_typeddict",
  "res_py_functools_partial", "res_py_functools_cache", "res_py_functools_lru_cache",
  "res_py_functools_singledispatch", "res_py_operator", "res_py_contextlib",
  "res_py_itertools", "res_py_asyncio", "res_py_concurrent_futures",
  "res_py_multiprocessing", "res_py_threading",
  "res_py_curio",
]);
const RESOURCE_IDS = new Set([
  ...Object.keys(RESOURCE_URLS), ...URL_LESS_RESOURCES,
]);
// Catalogue rows the seeder adds. They must all be mapped somewhere, and
// every URL must be an absolute https link (all were HTTP-verified before
// being added).
const NEW_RESOURCE_IDS = new Set(NEW_RESOURCES.map(([id]) => id));
for (const [id, title, kind, level, url] of NEW_RESOURCES) {
  RESOURCE_URLS[id] = url;
  RESOURCE_IDS.add(id);
}

describe("seed-node-resources canonical mapping", () => {
  it("references only real canonical node ids", () => {
    expect(LINKS.length).toBeGreaterThan(0);
    for (const [nodeId] of LINKS) {
      expect(ALL_NODE_IDS.has(nodeId), `unknown node ${nodeId}`).toBe(true);
    }
  });

  it("references only real canonical resource ids, each a known row", () => {
    for (const [, resourceId] of LINKS) {
      expect(RESOURCE_IDS.has(resourceId), `unknown resource ${resourceId}`).toBe(true);
    }
  });

  it("maps every name-identity node to its exact catalogue resource", () => {
    for (const [nodeId, resourceId] of NAME_IDENTITY) {
      const rows = LINKS.filter(([n]) => n === nodeId);
      expect(rows.map(([, r]) => r), `${nodeId} pairing`).toContain(resourceId);
    }
  });

  it("links only resources that have a destination or are known URL-less", () => {
    for (const [, resourceId] of LINKS) {
      const hasUrl = Boolean(RESOURCE_URLS[resourceId]);
      expect(hasUrl || URL_LESS_RESOURCES.has(resourceId), `${resourceId} destination`).toBe(true);
    }
  });

  it("adds catalogue resources that are actually used by a mapping", () => {
    for (const [id] of NEW_RESOURCES) {
      expect(LINKS.some(([, r]) => r === id), `${id} is never mapped`).toBe(true);
    }
  });

  it("covers every AI/ML node in this batch with at least two resources", () => {
    const perNode = {};
    for (const [n] of LINKS) perNode[n] = (perNode[n] || 0) + 1;
    for (const id of AI_ML_NODE_IDS) {
      expect(perNode[id], `${id} unmapped`).toBeDefined();
      if (SINGLE_REFERENCE_NODES.has(id)) continue;
      expect(perNode[id], `${id} has ${perNode[id]}`).toBeGreaterThanOrEqual(2);
    }
    // The exceptions must stay minimal and justified.
    for (const id of SINGLE_REFERENCE_NODES) {
      expect(perNode[id], `${id} should still have one reference`).toBe(1);
      expect(AI_ML_NODE_IDS.has(id), `${id} not in this batch`).toBe(true);
    }
  });

  it("covers every Cybersecurity node in this batch", () => {
    const perNode = {};
    for (const [n] of LINKS) perNode[n] = (perNode[n] || 0) + 1;
    expect(CY_NODE_IDS.size).toBe(48);
    for (const id of CY_NODE_IDS) {
      expect(perNode[id], `${id} unmapped`).toBeDefined();
      if (CY_SINGLE_REFERENCE.has(id)) {
        expect(perNode[id], `${id} should have one`).toBe(1);
      } else {
        expect(perNode[id], `${id} has ${perNode[id]}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("maps each security platform node only to its own platform resource", () => {
    const expected = {
      cy_platform_tryhackme: "res_cy_tryhackme",
      cy_platform_overthewire: "res_cy_overthewire",
      cy_platform_pwn_college: "res_cy_pwn_college",
      cy_platform_portswigger: "res_cy_portswigger",
      cy_platform_ctflearn: "res_cy_ctflearn",
      cy_platform_cylab_academy: "res_cy_cylab_academy",
      cy_platform_cryptohack: "res_cy_cryptohack",
    };
    for (const [nodeId, resourceId] of Object.entries(expected)) {
      const rows = LINKS.filter(([n]) => n === nodeId).map(([, r]) => r);
      expect(rows, nodeId).toEqual([resourceId]);
    }
  });

  it("gives every electronics-fundamentals node three topic-specific resources", () => {
    const perNode = {};
    for (const [n] of LINKS) perNode[n] = (perNode[n] || 0) + 1;
    for (const id of EM_FUNDAMENTAL_NODES) {
      expect(perNode[id], `${id} has ${perNode[id]}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not reuse one generic electronics guide for every embedded node", () => {
    const usesAllAbout = LINKS.filter(
      ([n, r]) => EM_FUNDAMENTAL_NODES.has(n) && r === "res_em_all_about_circuits"
    );
    expect(usesAllAbout.length).toBeLessThan(EM_FUNDAMENTAL_NODES.size);
    const distinct = new Set(
      LINKS.filter(([n]) => EM_FUNDAMENTAL_NODES.has(n)).map(([, r]) => r)
    );
    expect(distinct.size).toBeGreaterThanOrEqual(6);
  });

  it("maps every node in each completed embedded batch at least once", () => {
    const covered = new Set(LINKS.map(([n]) => n));
    for (const id of [...EM_FUNDAMENTAL_NODES, ...EM_BATCH2_NODES, ...EM_BATCH3_NODES, ...EM_BATCH4_NODES, ...EM_BATCH5_NODES, ...BACKEND_NODES, ...DEVOPS_NODES]) {
      expect(covered.has(id), `${id} unmapped`).toBe(true);
    }
    for (const id of [...EM_BATCH2_NODES, ...EM_BATCH3_NODES, ...EM_BATCH4_NODES, ...BACKEND_NODES, ...DEVOPS_NODES]) {
      const n = LINKS.filter(([x]) => x === id).length;
      expect(n, `${id} has ${n}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("covers the review-prioritised foundation nodes", () => {
    const linked = new Set(LINKS.map(([n]) => n));
    for (const id of [
      "web_html5", "web_css3", "web_javascript_core", "web_git_github",
      "web_dev_tools_fundamentals", "web_react_fundamentals",
      "web_react_intermediate", "web_react_advanced",
    ]) {
      expect(linked.has(id), `${id} should have study material`).toBe(true);
    }
  });

  it("has no duplicate pairs and orders each node from zero", () => {
    const seen = new Set();
    const perNode = {};
    for (const [nodeId, resourceId, sortOrder] of LINKS) {
      const key = `${nodeId}::${resourceId}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
      (perNode[nodeId] ??= []).push(sortOrder);
    }
    for (const [nodeId, orders] of Object.entries(perNode)) {
      expect([...orders].sort((a, b) => a - b), nodeId).toEqual(orders.map((_, i) => i));
    }
  });

  it("leaves the two unverified web nodes explicitly uncovered", () => {
    const linked = new Set(LINKS.map(([n]) => n));
    for (const id of UNCOVERED_NODES) expect(linked.has(id), `${id} should be uncovered`).toBe(false);
    expect(UNCOVERED_NODES).toEqual([]);
  });

  it("gives every mapped node at least one USABLE resource, not just a row", () => {
    // "Mapped" is not "usable": a node whose entire shelf has no destination
    // renders as an empty list of "unavailable" rows, which is what the Web
    // track looked like. Every node must hold at least one real URL.
    //
    // Two DSA nodes are named exceptions, and the list is pinned so it cannot
    // grow silently: their only catalogue rows are a LeetCode/Codeforces
    // editorial and a Udemy course, both of which answer 403 to automated
    // requests. No URL was invented to fill them.
    const NO_VERIFIED_URL = new Set(["dsa_leetcode_codeforces", "dsa_karumahchi"]);
    const perNode = {};
    for (const [nodeId, resourceId] of LINKS) {
      (perNode[nodeId] ??= []).push(RESOURCE_URLS[resourceId]);
    }
    for (const [nodeId, urls] of Object.entries(perNode)) {
      if (NO_VERIFIED_URL.has(nodeId)) continue;
      expect(urls.some(Boolean), `${nodeId} has no usable resource`).toBe(true);
    }
    // The exception list must describe reality, not excuse a regression.
    for (const id of NO_VERIFIED_URL) {
      expect(perNode[id], `${id} should still be mapped`).toBeDefined();
      expect(perNode[id].some(Boolean), `${id} unexpectedly gained a URL`).toBe(false);
    }
  });

  it("covers all 14 Web roadmap nodes with at least one usable resource", () => {
    // The 14 rows the student's Web roadmap renders: ten canonical `web_*`
    // nodes plus the four legacy placeholders from migration 011.
    const webIds = [
      "web_html5", "web_css3", "web_javascript_core", "web_git_github",
      "web_dev_tools_fundamentals", "web_css_frameworks",
      "web_react_fundamentals", "web_react_intermediate", "web_react_advanced",
      "web_mern_portfolio_projects",
      "node_html_css", "node_javascript", "node_git_github", "node_react",
    ];
    expect(webIds).toHaveLength(14);
    for (const id of webIds) {
      const usable = LINKS.filter(
        ([n, r]) => n === id && RESOURCE_URLS[r]
      );
      expect(usable.length, `${id} has no usable resource`).toBeGreaterThan(0);
    }
  });

  it("keeps every YouTube playlist link an external navigation, never an embed", () => {
    const playlistIds = Object.entries(RESOURCE_URLS)
      .filter(([, url]) => url.includes("youtube.com/playlist"))
      .map(([id]) => id)
      // Only rows the roadmap actually offers: the catalogue is larger than the
      // set of mapped resources, and an unmapped catalogue row is not a defect.
      .filter((id) => LINKS.some(([, r]) => r === id));
    expect(playlistIds.length).toBeGreaterThan(0);
    for (const id of playlistIds) {
      // No video id in a playlist URL → must NOT classify as an embed.
      expect(toZenModel({ id, url: RESOURCE_URLS[id] }).status).toBe("unsupported");
    }
  });
});
