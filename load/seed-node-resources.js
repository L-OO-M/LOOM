// load/seed-node-resources.js — node→resource shelves for roadmap_node_resources (036).
// Replaces the domain-wide shelf query so each node lists its own material.
// Usage: node load/seed-node-resources.js   (uses DATABASE_URL — override it!)
//
// SCOPE: canonical catalogue nodes that have a genuine subject match in the
// existing resource set. Web track is hand-curated; Blockchain and DSA use
// the catalogue's own name-identity pairing (node names the exact channel,
// course, or sheet). Nodes with no genuine match stay uncovered and render
// the honest empty state — no filler, no invented rows.
//
// Idempotent: fixed pairs + ON CONFLICT DO NOTHING. Writes ONLY this table.
// Aborts if any referenced node/resource id is missing, so it can never
// invent or orphan rows.
const LINKS = [
  // ── AI / ML ────────────────────────────────────────────────────────────
  // Phase 1 • Foundations
  ["ai_ml_foundations_data_workflow", "res_ml_crash", 0],
  ["ai_ml_foundations_data_workflow", "res_ai_pandas_10min", 1],
  ["ai_ml_foundations_data_workflow", "res_ai_sklearn_user_guide", 2],
  ["ai_ml_fundamentals", "res_ml_crash", 0],
  ["ai_ml_fundamentals", "res_ai_d2l", 1],
  ["ai_ml_fundamentals", "res_kaggle_intro", 2],
  ["ai_data_acquisition_eda", "res_ai_pandas_10min", 0],
  ["ai_data_acquisition_eda", "res_ai_numpy_docs", 1],
  ["ai_data_acquisition_eda", "res_ml_crash", 2],
  ["ai_feature_engineering_preprocessing", "res_ai_sklearn_preprocessing", 0],
  ["ai_feature_engineering_preprocessing", "res_ml_crash", 1],
  ["ai_feature_engineering_preprocessing", "res_ai_pandas_10min", 2],

  // Phase 2 • Supervised learning — regression family
  ["ai_supervised_learning_regression", "res_ml_crash", 0],
  ["ai_supervised_learning_regression", "res_ai_sklearn_linear_model", 1],
  ["ai_simple_linear_regression", "res_ai_sklearn_linear_model", 0],
  ["ai_simple_linear_regression", "res_ml_crash", 1],
  ["ai_multiple_linear_regression", "res_ai_sklearn_linear_model", 0],
  ["ai_multiple_linear_regression", "res_ml_crash", 1],
  ["ai_gradient_descent_for_regression", "res_ml_crash", 0],
  ["ai_gradient_descent_for_regression", "res_ai_d2l", 1],
  ["ai_polynomial_regression", "res_ai_sklearn_linear_model", 0],
  ["ai_polynomial_regression", "res_ml_crash", 1],
  ["ai_regression_metrics", "res_ai_sklearn_user_guide", 0],
  ["ai_regression_metrics", "res_ml_crash", 1],
  ["ai_bias_variance_regularized_regression", "res_ml_crash", 0],
  ["ai_bias_variance_regularized_regression", "res_ai_sklearn_linear_model", 1],
  ["ai_bias_variance_tradeoff", "res_ml_crash", 0],
  ["ai_bias_variance_tradeoff", "res_ai_d2l", 1],
  ["ai_ridge_regression_l2", "res_ai_sklearn_linear_model", 0],
  ["ai_ridge_regression_l2", "res_ml_crash", 1],
  ["ai_lasso_regression_l1", "res_ai_sklearn_linear_model", 0],
  ["ai_lasso_regression_l1", "res_ml_crash", 1],
  ["ai_elastic_net", "res_ai_sklearn_linear_model", 0],

  // Phase 3 • Ensembles
  ["ai_ensemble_learning", "res_ai_sklearn_ensemble", 0],
  ["ai_ensemble_learning", "res_ml_crash", 1],
  ["ai_voting_ensembles", "res_ai_sklearn_ensemble", 0],
  ["ai_bagging", "res_ai_sklearn_ensemble", 0],
  ["ai_bagging", "res_ml_crash", 1],
  ["ai_random_forest", "res_ai_sklearn_ensemble", 0],
  ["ai_random_forest", "res_ai_sklearn_permutation_importance", 1],
  ["ai_adaboost", "res_ai_sklearn_ensemble", 0],
  ["ai_adaboost", "res_ml_crash", 1],
  ["ai_gradient_boosting", "res_ai_sklearn_ensemble", 0],
  ["ai_gradient_boosting", "res_ml_crash", 1],
  ["ai_xgboost", "res_ai_xgboost_docs", 0],
  ["ai_xgboost", "res_ai_sklearn_ensemble", 1],
  ["ai_stacking_blending", "res_ai_sklearn_ensemble", 0],

  // Phase 4 • Unsupervised learning & dimensionality
  ["ai_clustering_dimensionality_reduction", "res_ai_sklearn_clustering", 0],
  ["ai_clustering_dimensionality_reduction", "res_ai_sklearn_decomposition", 1],
  ["ai_k_means_clustering", "res_ai_sklearn_clustering", 0],
  ["ai_k_means_clustering", "res_ml_crash", 1],
  ["ai_agglomerative_hierarchical_clustering", "res_ai_sklearn_clustering", 0],
  ["ai_dbscan", "res_ai_sklearn_clustering", 0],
  ["ai_curse_of_dimensionality", "res_ai_sklearn_decomposition", 0],
  ["ai_curse_of_dimensionality", "res_ml_crash", 1],
  ["ai_pca", "res_ai_sklearn_decomposition", 0],
  ["ai_pca", "res_ml_crash", 1],

  // Phase 5 • Tuning & validation
  ["ai_hyperparameter_tuning_reliable_experiments", "res_ai_sklearn_gridsearch", 0],
  ["ai_hyperparameter_tuning_reliable_experiments", "res_ml_crash", 1],
  ["ai_search_strategies", "res_ai_sklearn_gridsearch", 0],
  ["ai_search_strategies", "res_ai_sklearn_cross_validation", 1],
  ["ai_search_strategies", "res_ai_optuna", 2],
  ["ai_experiment_hygiene", "res_ai_sklearn_cross_validation", 0],
  ["ai_experiment_hygiene", "res_ml_crash", 1],

  // Phase 6 • Deep learning
  ["ai_neural_network_fundamentals", "res_ai_d2l", 0],
  ["ai_neural_network_fundamentals", "res_ai_3b1b_nn", 1],
  ["ai_neural_network_fundamentals", "res_ai_keras_guide", 2],
  ["ai_neural_network_fundamentals", "res_ai_tf_tutorials", 3],
  ["ai_perceptron", "res_ai_3b1b_nn", 0],
  ["ai_perceptron", "res_ai_d2l", 1],
  ["ai_multi_layer_perceptron", "res_ai_keras_guide", 0],
  ["ai_multi_layer_perceptron", "res_ai_pytorch_docs", 1],
  ["ai_multi_layer_perceptron", "res_ai_pytorch_tutorials", 2],
  ["ai_loss_functions", "res_ai_d2l", 0],
  ["ai_loss_functions", "res_ai_pytorch_docs", 1],
  ["ai_backpropagation", "res_ai_3b1b_nn", 0],
  ["ai_backpropagation", "res_ai_d2l", 1],
  ["ai_backpropagation", "res_distill", 2],
  ["ai_optimization_activations_regularization", "res_ai_d2l", 0],
  ["ai_optimization_activations_regularization", "res_ai_keras_guide", 1],
  ["ai_gradient_descent_in_neural_networks", "res_ai_d2l", 0],
  ["ai_gradient_descent_in_neural_networks", "res_fastai", 1],
  ["ai_activation_functions", "res_ai_d2l", 0],
  ["ai_activation_functions", "res_ai_pytorch_docs", 1],
  ["ai_initialization", "res_ai_d2l", 0],
  ["ai_regularization_generalization", "res_ai_d2l", 0],
  ["ai_regularization_generalization", "res_fastai", 1],
  ["ai_optimizers", "res_ai_d2l", 0],
  ["ai_optimizers", "res_ai_pytorch_docs", 1],
  ["ai_nn_hyperparameter_tuning", "res_ai_keras_guide", 0],
  ["ai_nn_hyperparameter_tuning", "res_ai_optuna", 1],

  // Phase 7 • Computer vision
  ["ai_convolutional_neural_networks", "res_ai_cs231n", 0],
  ["ai_convolutional_neural_networks", "res_fastai", 1],
  ["ai_cnn_intuition", "res_ai_cs231n", 0],
  ["ai_cnn_intuition", "res_ai_3b1b_nn", 1],
  ["ai_convolution_operation", "res_ai_cs231n", 0],
  ["ai_convolution_operation", "res_ai_d2l", 1],
  ["ai_pooling", "res_ai_cs231n", 0],
  ["ai_cnn_architecture_backprop", "res_ai_cs231n", 0],
  ["ai_data_augmentation_transfer_learning", "res_ai_cs231n", 0],
  ["ai_data_augmentation_transfer_learning", "res_fastai", 1],

  // Phase 8 • Sequences
  ["ai_rnn_lstm_gru", "res_ai_colah_lstm", 0],
  ["ai_rnn_lstm_gru", "res_ai_d2l", 1],
  ["ai_recurrent_neural_networks", "res_ai_colah_lstm", 0],
  ["ai_recurrent_neural_networks", "res_ai_d2l", 1],
  ["ai_lstm", "res_ai_colah_lstm", 0],
  ["ai_lstm", "res_ai_d2l", 1],
  ["ai_gru", "res_ai_colah_lstm", 0],
  ["ai_gru", "res_ai_d2l", 1],
  ["ai_deep_bidirectional_rnns", "res_ai_colah_lstm", 0],
  ["ai_deep_bidirectional_rnns", "res_ai_d2l", 1],

  // Phase 9 • Attention & transformers
  ["ai_seq2seq_attention_transformers", "res_ai_illustrated_transformer", 0],
  ["ai_seq2seq_attention_transformers", "res_hf_nlp", 1],
  ["ai_encoder_decoder_seq2seq", "res_hf_nlp", 0],
  ["ai_encoder_decoder_seq2seq", "res_ai_d2l", 1],
  ["ai_attention_mechanism", "res_ai_illustrated_transformer", 0],
  ["ai_attention_mechanism", "res_distill", 1],
  ["ai_transformer_foundations", "res_ai_illustrated_transformer", 0],
  ["ai_transformer_foundations", "res_hf_nlp", 1],
  ["ai_positional_encoding_layer_norm", "res_ai_illustrated_transformer", 0],
  ["ai_positional_encoding_layer_norm", "res_hf_nlp", 1],
  ["ai_transformer_encoder", "res_hf_nlp", 0],
  ["ai_transformer_encoder", "res_ai_illustrated_transformer", 1],
  ["ai_transformer_decoder_inference", "res_hf_nlp", 0],
  ["ai_transformer_decoder_inference", "res_ai_illustrated_transformer", 1],

  // ── Embedded · sub-batch 1: Electronics Fundamentals (group 1) ─────────
  // Topic-specific: each node gets the material that actually teaches it,
  // not one generic electronics guide repeated everywhere.
  ["em_voltage_current_resistance_power", "res_em_mit_ocw_6002", 0],
  ["em_voltage_current_resistance_power", "res_em_khan_ee", 1],
  ["em_voltage_current_resistance_power", "res_em_all_about_circuits", 2],
  ["em_ohms_law_kirchhoffs_laws", "res_em_mit_ocw_6002", 0],
  ["em_ohms_law_kirchhoffs_laws", "res_em_all_about_circuits", 1],
  ["em_ohms_law_kirchhoffs_laws", "res_em_khan_ee", 2],
  ["em_resistors_capacitors_inductors", "res_em_electronics_notes", 0],
  ["em_resistors_capacitors_inductors", "res_em_every_circuit", 1],
  ["em_resistors_capacitors_inductors", "res_em_sparkfun_tutorials", 2],
  ["em_diodes_leds_transistors", "res_em_neso_academy", 0],
  ["em_diodes_leds_transistors", "res_em_sparkfun_tutorials", 1],
  ["em_diodes_leds_transistors", "res_em_electronics_notes", 2],
  ["em_mosfets_opamps", "res_em_neso_academy", 0],
  ["em_mosfets_opamps", "res_em_electronics_notes", 1],
  ["em_mosfets_opamps", "res_em_every_circuit", 2],
  ["em_voltage_regulators", "res_em_sparkfun_tutorials", 0],
  ["em_voltage_regulators", "res_em_electronics_notes", 1],
  ["em_voltage_regulators", "res_em_all_about_circuits", 2],
  ["em_analog_vs_digital_signals", "res_em_khan_ee", 0],
  ["em_analog_vs_digital_signals", "res_em_mit_ocw_6002", 1],
  ["em_analog_vs_digital_signals", "res_em_every_circuit", 2],
  ["em_basic_circuit_analysis", "res_em_mit_ocw_6002", 0],
  ["em_basic_circuit_analysis", "res_em_every_circuit", 1],
  ["em_basic_circuit_analysis", "res_em_khan_ee", 2],
  ["em_breadboard_multimeter_techniques", "res_em_sparkfun_tutorials", 0],
  ["em_breadboard_multimeter_techniques", "res_em_electronics_notes", 1],
  ["em_breadboard_multimeter_techniques", "res_em_all_about_circuits", 2],

  // ── Embedded · sub-batch 2: Digital Electronics + Programming & MCUs ───
  ["em_binary_hexadecimal_systems", "res_em_mit_ocw_6111", 0],
  ["em_binary_hexadecimal_systems", "res_em_ben_eater", 1],
  ["em_binary_hexadecimal_systems", "res_em_electronics_notes", 2],
  ["em_logic_gates_boolean_algebra", "res_em_mit_ocw_6111", 0],
  ["em_logic_gates_boolean_algebra", "res_em_ben_eater", 1],
  ["em_logic_gates_boolean_algebra", "res_em_sparkfun_tutorials", 2],
  ["em_combinational_circuits", "res_em_mit_ocw_6111", 0],
  ["em_combinational_circuits", "res_em_electronics_notes", 1],
  ["em_combinational_circuits", "res_em_ben_eater", 2],
  ["em_flipflops_latches", "res_em_mit_ocw_6111", 0],
  ["em_flipflops_latches", "res_em_ben_eater", 1],
  ["em_flipflops_latches", "res_em_electronics_notes", 2],
  ["em_registers_counters", "res_em_mit_ocw_6111", 0],
  ["em_registers_counters", "res_em_ben_eater", 1],
  ["em_registers_counters", "res_em_electronics_notes", 2],
  ["em_mux_demux", "res_em_mit_ocw_6111", 0],
  ["em_mux_demux", "res_em_electronics_notes", 1],
  ["em_mux_demux", "res_em_ben_eater", 2],
  ["em_adc_dac_architectures", "res_em_arduino_analog_input", 0],
  ["em_adc_dac_architectures", "res_em_arduino_analog_output", 1],
  ["em_adc_dac_architectures", "res_em_sparkfun_tutorials", 2],
  ["em_timers_memory_basics", "res_em_mit_ocw_6111", 0],
  ["em_timers_memory_basics", "res_em_electronics_notes", 1],
  ["em_timers_memory_basics", "res_em_sparkfun_tutorials", 2],

  ["em_c_cpp_fundamentals", "res_em_arduino_language_reference", 0],
  ["em_c_cpp_fundamentals", "res_em_c_reference", 1],
  ["em_c_cpp_fundamentals", "res_em_arduino_official_docs", 2],
  ["em_pointers_arrays_structures", "res_em_c_reference", 0],
  ["em_pointers_arrays_structures", "res_em_arduino_language_reference", 1],
  ["em_pointers_arrays_structures", "res_em_arduino_official_docs", 2],
  ["em_gpio_analog_digital_io", "res_em_arduino_digital_pins", 0],
  ["em_gpio_analog_digital_io", "res_em_arduino_analog_input", 1],
  ["em_gpio_analog_digital_io", "res_em_esp32_gpio_reference", 2],
  ["em_pwm_hardware_timers", "res_em_arduino_analog_output", 0],
  ["em_pwm_hardware_timers", "res_em_arduino_official_docs", 1],
  ["em_pwm_hardware_timers", "res_em_sparkfun_tutorials", 2],
  ["em_hardware_software_interrupts", "res_em_arduino_official_docs", 0],
  ["em_hardware_software_interrupts", "res_em_sparkfun_tutorials", 1],
  ["em_hardware_software_interrupts", "res_em_esp32_gpio_reference", 2],
  ["em_serial_communication_uart", "res_em_arduino_official_docs", 0],
  ["em_serial_communication_uart", "res_em_sparkfun_tutorials", 1],
  ["em_serial_communication_uart", "res_em_esp32_gpio_reference", 2],
  ["em_ecosystem_arduino_esp8266_esp32_stm32", "res_em_arduino_official_docs", 0],
  ["em_ecosystem_arduino_esp8266_esp32_stm32", "res_em_espressif_docs", 1],
  ["em_ecosystem_arduino_esp8266_esp32_stm32", "res_em_esp32_arduino_docs", 2],

  // ── Embedded · sub-batch 3: Sensors/Actuators + Protocols + IoT ───────
  // Sensors & actuators — vendor learning systems that genuinely cover the
  // component family named by each node.
  ["em_temperature_humidity_sensors", "res_em_adafruit_learning_system", 0],
  ["em_temperature_humidity_sensors", "res_em_sparkfun_tutorials", 1],
  ["em_temperature_humidity_sensors", "res_em_arduino_official_docs", 2],
  ["em_ultrasonic_pir_motion_sensors", "res_em_sparkfun_tutorials", 0],
  ["em_ultrasonic_pir_motion_sensors", "res_em_adafruit_learning_system", 1],
  ["em_ultrasonic_pir_motion_sensors", "res_em_arduino_analog_input", 2],
  ["em_imu_mpu6050_accelerometers", "res_em_adafruit_learning_system", 0],
  ["em_imu_mpu6050_accelerometers", "res_em_sparkfun_tutorials", 1],
  ["em_imu_mpu6050_accelerometers", "res_em_arduino_official_docs", 2],
  ["em_relays_mosfet_switches", "res_em_sparkfun_relay_tutorial", 0],
  ["em_relays_mosfet_switches", "res_em_neso_academy", 1],
  ["em_relays_mosfet_switches", "res_em_electronics_notes", 2],
  ["em_motors_motor_drivers_hbridge", "res_em_sparkfun_tutorials", 0],
  ["em_motors_motor_drivers_hbridge", "res_em_arduino_official_docs", 1],
  ["em_motors_motor_drivers_hbridge", "res_em_every_circuit", 2],
  ["em_servo_motors_encoders", "res_em_sparkfun_tutorials", 0],
  ["em_servo_motors_encoders", "res_em_arduino_official_docs", 1],
  ["em_servo_motors_encoders", "res_em_adafruit_learning_system", 2],
  ["em_displays_oled_tft_lcd", "res_em_adafruit_learning_system", 0],
  ["em_displays_oled_tft_lcd", "res_em_sparkfun_tutorials", 1],
  ["em_displays_oled_tft_lcd", "res_em_arduino_analog_output", 2],
  ["em_sd_cards_storage", "res_em_sparkfun_tutorials", 0],
  ["em_sd_cards_storage", "res_em_arduino_official_docs", 1],
  ["em_sd_cards_storage", "res_em_esp32_ota_reference", 2],
  ["em_batteries_charging_power_management", "res_em_sparkfun_tutorials", 0],
  ["em_batteries_charging_power_management", "res_em_electronics_notes", 1],
  ["em_batteries_charging_power_management", "res_em_adafruit_learning_system", 2],

  // Communication protocols — protocol docs, not generic guides
  ["em_uart", "res_em_arduino_official_docs", 0],
  ["em_uart", "res_em_sparkfun_serial_tutorial", 1],
  ["em_uart", "res_em_esp32_arduino_docs", 2],
  ["em_i2c", "res_em_esp32_i2c_reference", 0],
  ["em_i2c", "res_em_sparkfun_i2c_tutorial", 1],
  ["em_i2c", "res_em_esp32_arduino_docs", 2],
  ["em_spi", "res_em_esp32_spi_reference", 0],
  ["em_spi", "res_em_sparkfun_tutorials", 1],
  ["em_spi", "res_em_esp32_arduino_docs", 2],
  ["em_can_bus", "res_em_esp32_can_reference", 0],
  ["em_can_bus", "res_em_esp_idf_guides", 1],
  ["em_can_bus", "res_em_esp32_arduino_docs", 2],
  ["em_pwm_signal_control", "res_em_arduino_analog_output", 0],
  ["em_pwm_signal_control", "res_em_sparkfun_tutorials", 1],
  ["em_pwm_signal_control", "res_em_arduino_official_docs", 2],
  ["em_usb_protocol_basics", "res_em_arduino_official_docs", 0],
  ["em_usb_protocol_basics", "res_em_esp32_arduino_docs", 1],
  ["em_usb_protocol_basics", "res_em_sparkfun_tutorials", 2],
  ["em_wifi_bluetooth_ble", "res_em_esp32_wifi_api", 0],
  ["em_wifi_bluetooth_ble", "res_em_esp_idf_guides", 1],
  ["em_wifi_bluetooth_ble", "res_em_espressif_docs", 2],
  ["em_mqtt_messaging", "res_em_mqtt_org", 0],
  ["em_mqtt_messaging", "res_em_esp32_arduino_docs", 1],
  ["em_mqtt_messaging", "res_em_esp_idf_guides", 2],

  // IoT & connected hardware
  ["em_esp32_networking_frameworks", "res_em_esp_idf_guides", 0],
  ["em_esp32_networking_frameworks", "res_em_esp32_wifi_api", 1],
  ["em_esp32_networking_frameworks", "res_em_espressif_docs", 2],
  ["em_wifi_ble_connectivity", "res_em_esp32_wifi_api", 0],
  ["em_wifi_ble_connectivity", "res_em_esp_idf_guides", 1],
  ["em_wifi_ble_connectivity", "res_em_espressif_docs", 2],
  ["em_mqtt_http_rest_apis", "res_em_mqtt_org", 0],
  ["em_mqtt_http_rest_apis", "res_em_esp_idf_guides", 1],
  ["em_mqtt_http_rest_apis", "res_em_esp32_arduino_docs", 2],
  ["em_embedded_web_servers", "res_em_esp_idf_guides", 0],
  ["em_embedded_web_servers", "res_em_esp32_arduino_docs", 1],
  ["em_embedded_web_servers", "res_em_esp32_wifi_api", 2],
  ["em_firebase_cloud_platform_integration", "res_em_esp_idf_guides", 0],
  ["em_firebase_cloud_platform_integration", "res_em_mqtt_org", 1],
  ["em_firebase_cloud_platform_integration", "res_em_esp32_arduino_docs", 2],
  ["em_ota_firmware_updates", "res_em_esp32_ota_reference", 0],
  ["em_ota_firmware_updates", "res_em_esp_idf_guides", 1],
  ["em_ota_firmware_updates", "res_em_espressif_docs", 2],
  ["em_iot_device_security_fundamentals", "res_em_esp_idf_guides", 0],
  ["em_iot_device_security_fundamentals", "res_em_espressif_docs", 1],
  ["em_iot_device_security_fundamentals", "res_cy_owasp_iot_top10", 2],
  ["em_low_power_optimization_sleep_modes", "res_em_esp_idf_guides", 0],
  ["em_low_power_optimization_sleep_modes", "res_em_espressif_docs", 1],
  ["em_low_power_optimization_sleep_modes", "res_em_esp32_arduino_docs", 2],

  // ── Embedded · sub-batch 4: PCB Design + Embedded Systems + RTOS + Debug ─
  ["em_circuit_schematics_netlists", "res_em_kicad_schematic_editor", 0],
  ["em_circuit_schematics_netlists", "res_em_kicad_docs", 1],
  ["em_circuit_schematics_netlists", "res_em_electronics_notes", 2],
  ["em_component_selection_datasheet_review", "res_em_electronics_notes", 0],
  ["em_component_selection_datasheet_review", "res_em_sparkfun_tutorials", 1],
  ["em_component_selection_datasheet_review", "res_em_adafruit_learning_system", 2],
  ["em_footprint_symbol_creation", "res_em_kicad_pcbnew", 0],
  ["em_footprint_symbol_creation", "res_em_kicad_docs", 1],
  ["em_footprint_symbol_creation", "res_em_altium_education", 2],
  ["em_multi_layer_pcb_stacks", "res_em_kicad_pcbnew", 0],
  ["em_multi_layer_pcb_stacks", "res_em_altium_education", 1],
  ["em_multi_layer_pcb_stacks", "res_em_electronics_notes", 2],
  ["em_high_speed_power_routing", "res_em_kicad_pcbnew", 0],
  ["em_high_speed_power_routing", "res_em_altium_education", 1],
  ["em_high_speed_power_routing", "res_em_electronics_notes", 2],
  ["em_ground_planes_return_paths", "res_em_kicad_pcbnew", 0],
  ["em_ground_planes_return_paths", "res_em_altium_education", 1],
  ["em_ground_planes_return_paths", "res_em_electronics_notes", 2],
  ["em_erc_drc_design_rule_verification", "res_em_kicad_schematic_editor", 0],
  ["em_erc_drc_design_rule_verification", "res_em_kicad_pcbnew", 1],
  ["em_erc_drc_design_rule_verification", "res_em_kicad_docs", 2],
  ["em_gerber_drill_file_generation", "res_em_kicad_pcbnew", 0],
  ["em_gerber_drill_file_generation", "res_em_kicad_docs", 1],
  ["em_gerber_drill_file_generation", "res_em_altium_education", 2],
  ["em_pcba_dfm", "res_em_altium_education", 0],
  ["em_pcba_dfm", "res_em_kicad_pcbnew", 1],
  ["em_pcba_dfm", "res_em_sparkfun_tutorials", 2],
  ["em_eda_software_kicad_altium", "res_em_kicad_docs", 0],
  ["em_eda_software_kicad_altium", "res_em_altium_education", 1],
  ["em_eda_software_kicad_altium", "res_em_altium_designer", 2],

  // Embedded systems / Cortex-M
  ["em_bare_metal_embedded_c", "res_em_c_reference", 0],
  ["em_bare_metal_embedded_c", "res_em_arduino_language_reference", 1],
  ["em_bare_metal_embedded_c", "res_em_esp_idf_guides", 2],
  ["em_arm_cortex_m_architecture", "res_em_keil_mdk", 0],
  ["em_arm_cortex_m_architecture", "res_em_esp_idf_guides", 1],
  ["em_arm_cortex_m_architecture", "res_em_c_reference", 2],
  ["em_stm32_hardware_peripherals", "res_em_keil_mdk", 0],
  ["em_stm32_hardware_peripherals", "res_em_esp_idf_guides", 1],
  ["em_stm32_hardware_peripherals", "res_em_esp32_gpio_reference", 2],
  ["em_direct_register_access", "res_em_esp32_gpio_reference", 0],
  ["em_direct_register_access", "res_em_esp_idf_guides", 1],
  ["em_direct_register_access", "res_em_esp32_can_reference", 2],
  ["em_advanced_interrupts_timers_dma", "res_em_esp_idf_guides", 0],
  ["em_advanced_interrupts_timers_dma", "res_em_esp32_can_reference", 1],
  ["em_advanced_interrupts_timers_dma", "res_em_esp32_i2c_reference", 2],
  ["em_custom_peripheral_driver_development", "res_em_esp_idf_guides", 0],
  ["em_custom_peripheral_driver_development", "res_em_espressif_docs", 1],
  ["em_custom_peripheral_driver_development", "res_em_c_reference", 2],
  ["em_custom_bootloaders", "res_em_esp32_ota_reference", 0],
  ["em_custom_bootloaders", "res_em_esp_idf_guides", 1],
  ["em_custom_bootloaders", "res_em_c_reference", 2],
  ["em_hardware_debugging_swd_jtag", "res_em_openocd", 0],
  ["em_hardware_debugging_swd_jtag", "res_em_keil_mdk", 1],
  ["em_hardware_debugging_swd_jtag", "res_em_esp_idf_guides", 2],
  ["em_memory_management_linker_scripts", "res_em_c_reference", 0],
  ["em_memory_management_linker_scripts", "res_em_esp_idf_guides", 1],
  ["em_memory_management_linker_scripts", "res_em_keil_mdk", 2],
  ["em_low_power_operational_modes", "res_em_esp_idf_guides", 0],
  ["em_low_power_operational_modes", "res_em_espressif_docs", 1],
  ["em_low_power_operational_modes", "res_em_esp32_arduino_docs", 2],

  // RTOS
  ["em_freertos_kernel_fundamentals", "res_em_freertos_root", 0],
  ["em_freertos_kernel_fundamentals", "res_em_espidf_freertos", 1],
  ["em_freertos_kernel_fundamentals", "res_em_esp_idf_guides", 2],
  ["em_task_creation_states_prioritization", "res_em_freertos_root", 0],
  ["em_task_creation_states_prioritization", "res_em_espidf_freertos", 1],
  ["em_task_creation_states_prioritization", "res_em_esp_idf_guides", 2],
  ["em_preemptive_vs_cooperative_scheduling", "res_em_freertos_root", 0],
  ["em_preemptive_vs_cooperative_scheduling", "res_em_espidf_freertos", 1],
  ["em_preemptive_vs_cooperative_scheduling", "res_em_esp_idf_guides", 2],
  ["em_queues_mailboxes", "res_em_espidf_freertos", 0],
  ["em_queues_mailboxes", "res_em_freertos_root", 1],
  ["em_queues_mailboxes", "res_em_esp_idf_guides", 2],
  ["em_semaphores_mutexes", "res_em_espidf_freertos", 0],
  ["em_semaphores_mutexes", "res_em_freertos_root", 1],
  ["em_semaphores_mutexes", "res_em_esp_idf_guides", 2],
  ["em_inter_task_communication_isr_safe_apis", "res_em_espidf_freertos", 0],
  ["em_inter_task_communication_isr_safe_apis", "res_em_freertos_root", 1],
  ["em_inter_task_communication_isr_safe_apis", "res_em_esp_idf_guides", 2],
  ["em_real_time_constraints_deadlock_avoidance", "res_em_freertos_root", 0],
  ["em_real_time_constraints_deadlock_avoidance", "res_em_espidf_freertos", 1],
  ["em_real_time_constraints_deadlock_avoidance", "res_em_esp_idf_guides", 2],

  // Hardware debugging & product development
  ["em_oscilloscope_logic_analyzer_mastery", "res_em_eevblog", 0],
  ["em_oscilloscope_logic_analyzer_mastery", "res_em_sparkfun_tutorials", 1],
  ["em_oscilloscope_logic_analyzer_mastery", "res_em_phils_lab", 2],
  ["em_deep_datasheet_errata_analysis", "res_em_electronics_notes", 0],
  ["em_deep_datasheet_errata_analysis", "res_em_esp32_gpio_reference", 1],
  ["em_deep_datasheet_errata_analysis", "res_em_esp32_i2c_reference", 2],
  ["em_signal_power_integrity_debugging", "res_em_every_circuit", 0],
  ["em_signal_power_integrity_debugging", "res_em_eevblog", 1],
  ["em_signal_power_integrity_debugging", "res_em_phils_lab", 2],
  ["em_emi_emc_compliance_basics", "res_em_electronics_notes", 0],
  ["em_emi_emc_compliance_basics", "res_em_every_circuit", 1],
  ["em_emi_emc_compliance_basics", "res_em_sparkfun_tutorials", 2],
  ["em_thermal_management_dissipation", "res_em_electronics_notes", 0],
  ["em_thermal_management_dissipation", "res_em_neso_academy", 1],
  ["em_thermal_management_dissipation", "res_em_adafruit_learning_system", 2],
  ["em_hardware_qualification_validation", "res_em_sparkfun_tutorials", 0],
  ["em_hardware_qualification_validation", "res_em_altium_education", 1],
  ["em_hardware_qualification_validation", "res_em_electronics_notes", 2],
  ["em_prototyping_testing_iteration_production", "res_em_sparkfun_tutorials", 0],
  ["em_prototyping_testing_iteration_production", "res_em_greatscott", 1],
  ["em_prototyping_testing_iteration_production", "res_em_arduino_tutorials", 2],

  // ── Embedded · sub-batch 5: Arduino basics/boards/projects + Raspberry Pi ─
  ["em_ar_what_is_arduino", "res_em_arduino_official_docs", 0],
  ["em_ar_what_is_arduino", "res_em_arduino_tutorials", 1],
  ["em_ar_types_of_arduino_boards", "res_arduino_hardware_docs", 0],
  ["em_ar_types_of_arduino_boards", "res_em_arduino_official_docs", 1],
  ["em_ar_types_of_arduino_boards", "res_arduino_store", 2],
  ["em_ar_arduino_uno", "res_arduino_hardware_docs", 0],
  ["em_ar_arduino_uno", "res_em_arduino_official_docs", 1],
  ["em_ar_arduino_uno", "res_arduino_store", 2],
  ["em_ar_board_breakdown", "res_arduino_hardware_docs", 0],
  ["em_ar_board_breakdown", "res_em_arduino_official_docs", 1],
  ["em_ar_power_supply", "res_arduino_hardware_docs", 0],
  ["em_ar_power_supply", "res_em_electronics_notes", 1],
  ["em_ar_power_supply", "res_em_sparkfun_tutorials", 2],
  ["em_ar_breadboard", "res_em_sparkfun_tutorials", 0],
  ["em_ar_breadboard", "res_em_electronics_notes", 1],
  ["em_ar_breadboard", "res_em_adafruit_learning_system", 2],
  ["em_ar_how_to_program", "res_em_arduino_ide_software", 0],
  ["em_ar_how_to_program", "res_em_arduino_language_reference", 1],
  ["em_ar_how_to_program", "res_em_arduino_tutorials", 2],
  ["em_ar_how_everything_works_together", "res_em_arduino_official_docs", 0],
  ["em_ar_how_everything_works_together", "res_em_arduino_tutorials", 1],
  ["em_ar_how_everything_works_together", "res_em_arduino_ide_software", 2],
  ["em_ar_arduino_projects", "res_em_arduino_tutorials", 0],
  ["em_ar_arduino_projects", "res_pi_projects", 1],
  ["em_ar_arduino_projects", "res_em_arduino_official_docs", 2],
  ["em_ar_tools_needed", "res_arduino_store", 0],
  ["em_ar_tools_needed", "res_em_sparkfun_tutorials", 1],
  ["em_ar_tools_needed", "res_em_adafruit_learning_system", 2],
  ["em_ar_arduino_shields", "res_arduino_hardware_docs", 0],
  ["em_ar_arduino_shields", "res_arduino_store", 1],
  ["em_ar_arduino_shields", "res_em_arduino_official_docs", 2],
  ["em_ar_arduino_sensors", "res_em_adafruit_learning_system", 0],
  ["em_ar_arduino_sensors", "res_em_sparkfun_tutorials", 1],
  ["em_ar_arduino_sensors", "res_em_arduino_tutorials", 2],
  ["em_ar_electronics_retailers", "res_arduino_store", 0],
  ["em_ar_electronics_retailers", "res_em_adafruit_learning_system", 1],
  ["em_ar_tools_and_parts_needed", "res_arduino_store", 0],
  ["em_ar_tools_and_parts_needed", "res_em_sparkfun_tutorials", 1],
  ["em_ar_tools_and_parts_needed", "res_em_adafruit_learning_system", 2],
  ["em_ar_download_the_software", "res_em_arduino_ide_software", 0],
  ["em_ar_download_the_software", "res_em_arduino_official_docs", 1],
  ["em_ar_download_the_software", "res_em_arduino_tutorials", 2],
  ["em_ar_arduino_ide", "res_em_arduino_ide_software", 0],
  ["em_ar_arduino_ide", "res_em_arduino_official_docs", 1],
  ["em_ar_arduino_ide", "res_em_arduino_tutorials", 2],
  ["em_ar_connect_your_arduino_uno", "res_arduino_hardware_docs", 0],
  ["em_ar_connect_your_arduino_uno", "res_em_arduino_tutorials", 1],
  ["em_ar_connect_your_arduino_uno", "res_em_arduino_official_docs", 2],
  ["em_ar_project_1_blink_an_led", "res_em_arduino_tutorials", 0],
  ["em_ar_project_1_blink_an_led", "res_em_arduino_official_docs", 1],
  ["em_ar_project_1_blink_an_led", "res_em_arduino_ide_software", 2],
  ["em_ar_change_the_code", "res_em_arduino_language_reference", 0],
  ["em_ar_change_the_code", "res_em_arduino_ide_software", 1],
  ["em_ar_change_the_code", "res_em_arduino_tutorials", 2],
  ["em_ar_project_2_led_w_switch", "res_em_arduino_tutorials", 0],
  ["em_ar_project_2_led_w_switch", "res_em_arduino_digital_pins", 1],
  ["em_ar_project_2_led_w_switch", "res_em_arduino_official_docs", 2],
  ["em_ar_troubleshooting", "res_em_arduino_tutorials", 0],
  ["em_ar_troubleshooting", "res_em_sparkfun_tutorials", 1],
  ["em_ar_troubleshooting", "res_em_arduino_official_docs", 2],
  ["em_ar_resources", "res_em_arduino_tutorials", 0],
  ["em_ar_resources", "res_em_arduino_official_docs", 1],
  ["em_ar_resources", "res_pi_projects", 2],

  // Raspberry Pi — official guides, project hub and magazine. Showcase nodes
  // share these official sources; no per-project URL is fabricated.
  ["rpi_introducing_raspberry_pi_4", "res_rpi_beginners_guide", 0],
  ["rpi_introducing_raspberry_pi_4", "res_rpi_adafruit", 1],
  ["rpi_introducing_raspberry_pi_4", "res_pi_magazine", 2],
  ["rpi_quickstart_guide", "res_rpi_beginners_guide", 0],
  ["rpi_quickstart_guide", "res_rpi_adafruit", 1],
  ["rpi_quickstart_guide", "res_pi_projects", 2],
  ["rpi_raspberry_pi_4_starter_guide", "res_rpi_beginners_guide", 0],
  ["rpi_raspberry_pi_4_starter_guide", "res_pi_projects", 1],
  ["rpi_raspberry_pi_4_starter_guide", "res_pi_magazine", 2],
  ["rpi_your_next_desktop_pc", "res_pi_magazine", 0],
  ["rpi_your_next_desktop_pc", "res_rpi_beginners_guide", 1],
  ["rpi_your_next_desktop_pc", "res_pi_projects", 2],
  ["rpi_4k_digital_media_hub", "res_pi_magazine", 0],
  ["rpi_4k_digital_media_hub", "res_pi_projects", 1],
  ["rpi_4k_digital_media_hub", "res_rpi_beginners_guide", 2],
  ["rpi_make_with_code", "res_rpi_electronics_guide", 0],
  ["rpi_make_with_code", "res_pi_projects", 1],
  ["rpi_make_with_code", "res_rpi_beginners_guide", 2],
  ["rpi_electronics_with_gpio_zero", "res_rpi_electronics_guide", 0],
  ["rpi_electronics_with_gpio_zero", "res_pi_projects", 1],
  ["rpi_electronics_with_gpio_zero", "res_rpi_adafruit", 2],
  ["rpi_teenage_dinner_klaxon", "res_pi_projects", 0],
  ["rpi_teenage_dinner_klaxon", "res_rpi_electronics_guide", 1],
  ["rpi_teenage_dinner_klaxon", "res_pi_magazine", 2],
  ["rpi_gpio_music_box", "res_pi_projects", 0],
  ["rpi_gpio_music_box", "res_rpi_electronics_guide", 1],
  ["rpi_gpio_music_box", "res_pi_magazine", 2],
  ["rpi_laundry_saving_rain_detector", "res_pi_projects", 0],
  ["rpi_laundry_saving_rain_detector", "res_rpi_electronics_guide", 1],
  ["rpi_laundry_saving_rain_detector", "res_pi_magazine", 2],
  ["rpi_smart_door", "res_pi_projects", 0],
  ["rpi_smart_door", "res_rpi_electronics_guide", 1],
  ["rpi_smart_door", "res_pi_magazine", 2],
  ["rpi_neopixel_display_cabinet_lights", "res_pi_projects", 0],
  ["rpi_neopixel_display_cabinet_lights", "res_rpi_electronics_guide", 1],
  ["rpi_neopixel_display_cabinet_lights", "res_pi_magazine", 2],
  ["rpi_build_a_secret_radio_chat_device", "res_pi_projects", 0],
  ["rpi_build_a_secret_radio_chat_device", "res_rpi_electronics_guide", 1],
  ["rpi_build_a_secret_radio_chat_device", "res_pi_magazine", 2],
  ["rpi_powerful_raspberry_pi_projects", "res_pi_projects", 0],
  ["rpi_powerful_raspberry_pi_projects", "res_pi_magazine", 1],
  ["rpi_powerful_raspberry_pi_projects", "res_rpi_beginners_guide", 2],
  ["rpi_low_cost_wheeled_robot_1", "res_pi_projects", 0],
  ["rpi_low_cost_wheeled_robot_1", "res_pi_magazine", 1],
  ["rpi_low_cost_wheeled_robot_2", "res_pi_projects", 0],
  ["rpi_low_cost_wheeled_robot_2", "res_pi_magazine", 1],
  ["rpi_low_cost_wheeled_robot_3", "res_pi_projects", 0],
  ["rpi_low_cost_wheeled_robot_3", "res_pi_magazine", 1],
  ["rpi_low_cost_wheeled_robot_4", "res_pi_projects", 0],
  ["rpi_low_cost_wheeled_robot_4", "res_pi_magazine", 1],
  ["rpi_marauders_map", "res_pi_projects", 0],
  ["rpi_marauders_map", "res_pi_magazine", 1],
  ["rpi_ai_plant_monitor", "res_pi_projects", 0],
  ["rpi_ai_plant_monitor", "res_pi_magazine", 1],
  ["rpi_ai_plant_monitor", "res_rpi_camera_module_v2", 2],
  ["rpi_comics_from_tv_recordings", "res_pi_projects", 0],
  ["rpi_comics_from_tv_recordings", "res_pi_magazine", 1],
  ["rpi_comics_from_tv_recordings", "res_rpi_camera_module_v2", 2],
  ["rpi_car_spy_pi", "res_pi_projects", 0],
  ["rpi_car_spy_pi", "res_pi_magazine", 1],
  ["rpi_car_spy_pi", "res_rpi_camera_module_v2", 2],

// Project showcases — official Pi project hub + magazine, plus the
// project-specific MagPi write-up wherever one is verified (200 + title
// match). Showcases with no verifiable article keep the two official hubs.
  ["rpi_as_we_are", "res_pi_projects", 0],
  ["rpi_as_we_are", "res_pi_magazine", 1],
  ["rpi_yuri_3_mars_rover", "res_pi_projects", 0],
  ["rpi_yuri_3_mars_rover", "res_pi_magazine", 1],
  ["rpi_sofi", "res_pi_projects", 0],
  ["rpi_sofi", "res_pi_magazine", 1],
  ["rpi_teslonda", "res_pi_projects", 0],
  ["rpi_teslonda", "res_pi_magazine", 1],
  ["rpi_pi_fighter", "res_pi_projects", 0],
  ["rpi_pi_fighter", "res_pi_magazine", 1],
  ["rpi_squirrel_cafe", "res_pi_projects", 0],
  ["rpi_squirrel_cafe", "res_pi_magazine", 1],
  ["rpi_tide_clock_weather_thing", "res_pi_tide_clock", 0],
  ["rpi_tide_clock_weather_thing", "res_pi_magazine", 1],
  ["rpi_tide_clock_weather_thing", "res_pi_projects", 2],
  ["rpi_a_whisper_of_moths", "res_pi_whisper_of_moths", 0],
  ["rpi_a_whisper_of_moths", "res_pi_magazine", 1],
  ["rpi_a_whisper_of_moths", "res_pi_projects", 2],
  ["rpi_underwater_drone", "res_pi_projects", 0],
  ["rpi_underwater_drone", "res_pi_magazine", 1],
  ["rpi_chord_assist", "res_pi_chord_assist", 0],
  ["rpi_chord_assist", "res_pi_magazine", 1],
  ["rpi_chord_assist", "res_pi_projects", 2],
  ["rpi_tv_wall", "res_pi_projects", 0],
  ["rpi_tv_wall", "res_pi_magazine", 1],
  ["rpi_telepresence_hand", "res_pi_projects", 0],
  ["rpi_telepresence_hand", "res_pi_magazine", 1],
  ["rpi_pi_vizuwall", "res_pi_projects", 0],
  ["rpi_pi_vizuwall", "res_pi_magazine", 1],
  ["rpi_smart_home_herb_garden", "res_pi_smart_home_herb_garden", 0],
  ["rpi_smart_home_herb_garden", "res_pi_magazine", 1],
  ["rpi_smart_home_herb_garden", "res_pi_projects", 2],
  ["rpi_marvin_go_kart", "res_pi_marvin_go_kart", 0],
  ["rpi_marvin_go_kart", "res_pi_magazine", 1],
  ["rpi_marvin_go_kart", "res_pi_projects", 2],
  ["rpi_tortoise_fridge", "res_pi_tortoise_fridge", 0],
  ["rpi_tortoise_fridge", "res_pi_magazine", 1],
  ["rpi_tortoise_fridge", "res_pi_projects", 2],
  ["rpi_immersive_bar", "res_pi_immersive_bar", 0],
  ["rpi_immersive_bar", "res_pi_magazine", 1],
  ["rpi_immersive_bar", "res_pi_projects", 2],

  // ── Web · previously held nodes, now backed by verified sources ────────
  ["web_css_frameworks", "res_web_bootstrap_docs", 0],
  ["web_css_frameworks", "res_web_tailwind_docs", 1],
  ["web_css_frameworks", "res_web_mdn_web_docs", 2],
  ["web_mern_portfolio_projects", "res_web_durgesh_blogging_app", 0],
  ["web_mern_portfolio_projects", "res_web_durgesh_full_courses", 1],
  ["web_mern_portfolio_projects", "res_web_mongodb_university", 2],
  ["web_dsa_track", "res_web_take_u_forward_dsa", 0],
  ["web_dsa_track", "res_dsa_striver_a2z", 1],
  ["web_dsa_track", "res_dsa_neetcode_150", 2],

  // ── Backend · Node/Express/Mongo · Java/Spring · System Design ─────────
  ["web_nodejs", "res_web_durgesh_full_courses", 0],
  ["web_nodejs", "res_web_telusko_java_spring", 1],
  ["web_nodejs", "res_web_postman", 2],
  ["web_expressjs", "res_web_durgesh_full_courses", 0],
  ["web_expressjs", "res_web_postman", 1],
  ["web_expressjs", "res_web_durgesh_blogging_app", 2],
  ["web_mongodb_mongoose", "res_web_mongodb_university", 0],
  ["web_mongodb_mongoose", "res_web_dbdiagram_io", 1],
  ["web_mongodb_mongoose", "res_web_durgesh_full_courses", 2],
  ["web_authentication_security", "res_web_postman", 0],
  ["web_authentication_security", "res_web_durgesh_full_courses", 1],
  ["web_authentication_security", "res_owasp_top10", 2],
  ["web_connecting_frontend_backend", "res_web_durgesh_blogging_app", 0],
  ["web_connecting_frontend_backend", "res_web_postman", 1],
  ["web_connecting_frontend_backend", "res_web_durgesh_full_courses", 2],
  ["web_java_basics", "res_web_codingshuttle_java_mastery", 0],
  ["web_java_basics", "res_web_telusko_java_spring", 1],
  ["web_java_basics", "res_web_baeldung", 2],
  ["web_oop", "res_web_codingshuttle_java_mastery", 0],
  ["web_oop", "res_web_baeldung", 1],
  ["web_oop", "res_web_telusko_java_spring", 2],
  ["web_collections_generics", "res_web_baeldung", 0],
  ["web_collections_generics", "res_web_codingshuttle_java_mastery", 1],
  ["web_collections_generics", "res_web_telusko_java_spring", 2],
  ["web_multithreading_exception_handling", "res_web_baeldung", 0],
  ["web_multithreading_exception_handling", "res_web_codingshuttle_java_mastery", 1],
  ["web_multithreading_exception_handling", "res_web_telusko_java_spring", 2],
  ["web_build_tools_jvm", "res_web_codingshuttle_java_mastery", 0],
  ["web_build_tools_jvm", "res_web_baeldung", 1],
  ["web_build_tools_jvm", "res_web_telusko_java_spring", 2],
  ["web_java_web_fundamentals", "res_web_spring_official_guides", 0],
  ["web_java_web_fundamentals", "res_web_baeldung", 1],
  ["web_java_web_fundamentals", "res_web_telusko_java_spring", 2],
  ["web_spring_framework_core", "res_web_spring_official_guides", 0],
  ["web_spring_framework_core", "res_web_baeldung", 1],
  ["web_spring_framework_core", "res_web_telusko_spring_boot", 2],
  ["web_spring_boot", "res_web_spring_official_guides", 0],
  ["web_spring_boot", "res_web_telusko_spring_boot", 1],
  ["web_spring_boot", "res_web_codingshuttle_spring_boot", 2],
  ["web_spring_data_jpa_hibernate", "res_web_spring_official_guides", 0],
  ["web_spring_data_jpa_hibernate", "res_web_baeldung", 1],
  ["web_spring_data_jpa_hibernate", "res_web_dbdiagram_io", 2],
  ["web_spring_security_jwt", "res_web_spring_official_guides", 0],
  ["web_spring_security_jwt", "res_owasp_top10", 1],
  ["web_spring_security_jwt", "res_web_baeldung", 2],
  ["web_connecting_spring_react", "res_web_durgesh_blogging_app", 0],
  ["web_connecting_spring_react", "res_web_spring_official_guides", 1],
  ["web_connecting_spring_react", "res_web_postman", 2],
  ["web_testing", "res_web_baeldung", 0],
  ["web_testing", "res_web_spring_official_guides", 1],
  ["web_testing", "res_web_postman", 2],
  ["web_low_level_design", "res_web_shrayansh_lld", 0],
  ["web_low_level_design", "res_web_gaurav_sen_system_design", 1],
  ["web_low_level_design", "res_web_baeldung", 2],
  ["web_high_level_design", "res_web_shrayansh_hld", 0],
  ["web_high_level_design", "res_web_gaurav_sen_system_design", 1],
  ["web_high_level_design", "res_web_baeldung", 2],

  // ── Backend · Python (Fluent Python catalogue) ───────────────────────
  ["py_the_python_data_model", "res_py_example_code_2e", 0],
  ["py_the_python_data_model", "res_py_example_code_short_link", 1],
  ["py_the_python_data_model", "res_py_errata_page", 2],
  ["py_an_array_of_sequences", "res_py_array_module", 0],
  ["py_an_array_of_sequences", "res_py_example_code_2e", 1],
  ["py_an_array_of_sequences", "res_py_example_code_short_link", 2],
  ["py_dictionaries_and_sets", "res_py_collections_defaultdict", 0],
  ["py_dictionaries_and_sets", "res_py_collections_chainmap", 1],
  ["py_dictionaries_and_sets", "res_py_collections_counter", 2],
  ["py_unicode_text_versus_bytes", "res_py_unicodedata", 0],
  ["py_unicode_text_versus_bytes", "res_py_pep_263", 1],
  ["py_unicode_text_versus_bytes", "res_py_re_pattern_matching", 2],
  ["py_data_class_builders", "res_py_dataclasses", 0],
  ["py_data_class_builders", "res_py_namedtuple", 1],
  ["py_data_class_builders", "res_py_example_code_2e", 2],
  ["py_object_references_mutability", "res_py_example_code_2e", 0],
  ["py_object_references_mutability", "res_py_example_code_short_link", 1],
  ["py_object_references_mutability", "res_py_errata_page", 2],
  ["py_functions_as_first_class_objects", "res_py_functools_cache", 0],
  ["py_functions_as_first_class_objects", "res_py_functools_singledispatch", 1],
  ["py_functions_as_first_class_objects", "res_py_example_code_2e", 2],
  ["py_type_hints_in_functions", "res_py_typing", 0],
  ["py_type_hints_in_functions", "res_py_typevar", 1],
  ["py_type_hints_in_functions", "res_py_mypy", 2],
  ["py_decorators_and_closures", "res_py_functools_partial", 0],
  ["py_decorators_and_closures", "res_py_functools_lru_cache", 1],
  ["py_decorators_and_closures", "res_py_example_code_short_link", 2],
  ["py_design_patterns_with_first_class_functions", "res_py_functools_singledispatch", 0],
  ["py_design_patterns_with_first_class_functions", "res_py_contextlib", 1],
  ["py_design_patterns_with_first_class_functions", "res_py_example_code_2e", 2],
  ["py_a_pythonic_object", "res_py_abc", 0],
  ["py_a_pythonic_object", "res_py_example_code_2e", 1],
  ["py_a_pythonic_object", "res_py_errata_page", 2],
  ["py_special_methods_for_sequences", "res_py_memoryview", 0],
  ["py_special_methods_for_sequences", "res_py_example_code_2e", 1],
  ["py_special_methods_for_sequences", "res_py_errata_page", 2],
  ["py_interfaces_protocols_and_abcs", "res_py_protocol", 0],
  ["py_interfaces_protocols_and_abcs", "res_py_abc", 1],
  ["py_interfaces_protocols_and_abcs", "res_py_collections_abc", 2],
  ["py_inheritance_for_better_or_for_worse", "res_py_abc", 0],
  ["py_inheritance_for_better_or_for_worse", "res_py_example_code_2e", 1],
  ["py_inheritance_for_better_or_for_worse", "res_py_errata_page", 2],
  ["py_more_about_type_hints", "res_py_typing", 0],
  ["py_more_about_type_hints", "res_py_typeddict", 1],
  ["py_more_about_type_hints", "res_py_mypy", 2],
  ["py_operator_overloading", "res_py_operator", 0],
  ["py_operator_overloading", "res_py_example_code_2e", 1],
  ["py_operator_overloading", "res_py_errata_page", 2],
  ["py_iterators_generators_and_classic_coroutines", "res_py_itertools", 0],
  ["py_iterators_generators_and_classic_coroutines", "res_py_example_code_short_link", 1],
  ["py_iterators_generators_and_classic_coroutines", "res_py_example_code_2e", 2],
  ["py_with_match_and_else_blocks", "res_py_contextlib", 0],
  ["py_with_match_and_else_blocks", "res_py_example_code_short_link", 1],
  ["py_with_match_and_else_blocks", "res_py_example_code_2e", 2],
  ["py_concurrency_models_in_python", "res_py_threading", 0],
  ["py_concurrency_models_in_python", "res_py_multiprocessing", 1],
  ["py_concurrency_models_in_python", "res_py_concurrent_futures", 2],
  ["py_concurrent_executors", "res_py_concurrent_futures", 0],
  ["py_concurrent_executors", "res_py_multiprocessing", 1],
  ["py_concurrent_executors", "res_py_asyncio", 2],
  ["py_asynchronous_programming", "res_py_asyncio", 0],
  ["py_asynchronous_programming", "res_py_curio", 1],
  ["py_asynchronous_programming", "res_py_concurrent_futures", 2],
  ["py_dynamic_attributes_and_properties", "res_py_example_code_2e", 0],
  ["py_dynamic_attributes_and_properties", "res_py_errata_page", 1],
  ["py_dynamic_attributes_and_properties", "res_py_example_code_short_link", 2],
  ["py_attribute_descriptors", "res_py_functools_singledispatch", 0],
  ["py_attribute_descriptors", "res_py_example_code_2e", 1],
  ["py_attribute_descriptors", "res_py_errata_page", 2],
  ["py_class_metaprogramming", "res_py_operator", 0],
  ["py_class_metaprogramming", "res_py_contextlib", 1],
  ["py_class_metaprogramming", "res_py_example_code_2e", 2],

  // ── DevOps ────────────────────────────────────────────────────────────
  ["web_deployment", "res_web_postman", 0],
  ["web_deployment", "res_web_durgesh_full_courses", 1],
  ["web_deployment", "res_web_spring_official_guides", 2],
  ["web_microservices_cloud_native", "res_web_telusko_java_spring", 0],
  ["web_microservices_cloud_native", "res_web_codingshuttle_spring_boot", 1],
  ["web_microservices_cloud_native", "res_web_spring_official_guides", 2],
  ["web_java_deployment", "res_web_telusko_java_spring", 0],
  ["web_java_deployment", "res_web_codingshuttle_spring_boot", 1],
  ["web_java_deployment", "res_web_spring_official_guides", 2],

  // ── Cybersecurity ──────────────────────────────────────────────────────
  // Foundations
  ["cy_linux_cli", "res_cy_linux_playlist", 0],
  ["cy_linux_cli", "res_cy_linux_man_pages", 1],
  ["cy_networking", "res_cy_mdn_http", 0],
  ["cy_networking", "res_cy_nmap_manual", 1],
  ["cy_programming", "res_cy_python_docs", 0],
  ["cy_programming", "res_cy_python_security_books", 1],
  ["cy_web_security", "res_owasp_top10", 0],
  ["cy_web_security", "res_cy_owasp_wstg", 1],
  ["cy_ctf_practice", "res_ctftime", 0],
  ["cy_ctf_practice", "res_cy_ctflearn", 1],
  ["cy_binary_systems", "res_cy_gdb_docs", 0],
  ["cy_binary_systems", "res_cy_pwn_college", 1],
  ["cy_cryptography", "res_cy_cryptopals", 0],
  ["cy_cryptography", "res_cy_nptel_foundations_crypto", 1],
  ["cy_continuous_learning", "res_cy_awesome_cyber_security", 0],
  ["cy_continuous_learning", "res_cy_nfsu_study_material", 1],

  // Foundations (group 2) — explicit sub-topics
  ["cy_foundations_linux", "res_cy_linux_playlist", 0],
  ["cy_foundations_linux", "res_cy_linux_man_pages", 1],
  ["cy_foundations_networking", "res_cy_mdn_http", 0],
  ["cy_foundations_networking", "res_cy_nist_sp800_115", 1],
  ["cy_foundations_programming", "res_cy_python_docs", 0],
  ["cy_foundations_programming", "res_cy_python_security_books", 1],
  ["cy_foundation_checkpoint", "res_cy_linux_playlist", 0],
  ["cy_foundation_checkpoint", "res_cy_python_docs", 1],

  // Hands-on platforms (group 3) — each node names its own platform
  ["cy_platform_tryhackme", "res_cy_tryhackme", 0],
  ["cy_platform_overthewire", "res_cy_overthewire", 0],
  ["cy_platform_pwn_college", "res_cy_pwn_college", 0],
  ["cy_platform_portswigger", "res_cy_portswigger", 0],
  ["cy_platform_ctflearn", "res_cy_ctflearn", 0],
  ["cy_platform_cylab_academy", "res_cy_cylab_academy", 0],
  ["cy_platform_cryptohack", "res_cy_cryptohack", 0],

  // CTF learning track (group 4)
  ["cy_ctf_linux_enumeration", "res_cy_linux_playlist", 0],
  ["cy_ctf_linux_enumeration", "res_cy_overthewire", 1],
  ["cy_ctf_web", "res_cy_portswigger", 0],
  ["cy_ctf_web", "res_owasp_top10", 1],
  ["cy_ctf_crypto", "res_cy_cryptopals", 0],
  ["cy_ctf_crypto", "res_cy_cryptohack", 1],
  ["cy_ctf_reverse_engineering", "res_cy_gdb_docs", 0],
  ["cy_ctf_reverse_engineering", "res_cy_pwn_college", 1],
  ["cy_ctf_binary_pwn", "res_cy_pwn_college", 0],
  ["cy_ctf_binary_pwn", "res_cy_gdb_docs", 1],
  ["cy_ctf_forensics", "res_cy_wireshark_docs", 0],
  ["cy_ctf_forensics", "res_cy_ctflearn", 1],
  ["cy_ctf_focused_channels", "res_cy_bitten_tech", 0],
  ["cy_ctf_focused_channels", "res_cy_john_hammond", 1],

  // Web security track (group 5)
  ["cy_web_track_portswigger", "res_cy_portswigger", 0],
  ["cy_web_track_portswigger", "res_cy_owasp_wstg", 1],
  ["cy_web_core_concepts", "res_cy_owasp_cheatsheets", 0],
  ["cy_web_core_concepts", "res_cy_mdn_http", 1],

  // Cryptography track (group 6)
  ["cy_crypto_nptel_foundations", "res_cy_nptel_foundations_crypto", 0],
  ["cy_crypto_nptel_network_security", "res_cy_nptel_network_security", 0],
  ["cy_crypto_cryptohack", "res_cy_cryptohack", 0],
  ["cy_crypto_cryptohack", "res_cy_cryptopals", 1],

  // Staying current & self-study (group 7)
  ["cy_current_networkchuck", "res_cy_networkchuck", 0],
  ["cy_current_nfsu_material", "res_cy_nfsu_study_material", 0],
  ["cy_current_keep_learning", "res_cy_awesome_cyber_security", 0],
  ["cy_current_keep_learning", "res_cy_nfsu_study_material", 1],

  // 12-week starter plan (group 8)
  ["cy_weeks_1_2", "res_cy_linux_playlist", 0],
  ["cy_weeks_1_2", "res_cy_linux_man_pages", 1],
  ["cy_weeks_3_4", "res_cy_mdn_http", 0],
  ["cy_weeks_3_4", "res_cy_nist_sp800_115", 1],
  ["cy_weeks_5_6", "res_cy_python_docs", 0],
  ["cy_weeks_5_6", "res_cy_python_security_books", 1],
  ["cy_weeks_7_8", "res_cy_portswigger", 0],
  ["cy_weeks_7_8", "res_cy_owasp_wstg", 1],
  ["cy_weeks_9_10", "res_cy_overthewire", 0],
  ["cy_weeks_9_10", "res_cy_tryhackme", 1],
  ["cy_weeks_11_12", "res_cy_pwn_college", 0],
  ["cy_weeks_11_12", "res_cy_cryptohack", 1],

  // Completion checklist (group 9)
  ["cy_check_linux_terminal", "res_cy_linux_playlist", 0],
  ["cy_check_linux_terminal", "res_cy_linux_man_pages", 1],
  ["cy_check_networking_protocols", "res_cy_mdn_http", 0],
  ["cy_check_python_scripts", "res_cy_python_docs", 0],
  ["cy_check_http_requests", "res_cy_portswigger", 0],
  ["cy_check_http_requests", "res_cy_mdn_http", 1],
  ["cy_check_ctf_challenges", "res_cy_ctflearn", 0],
  ["cy_check_ctf_challenges", "res_cy_cylab_academy", 1],
  ["cy_check_encoding_hashing_encryption", "res_cy_cryptopals", 0],
  ["cy_check_encoding_hashing_encryption", "res_cy_nptel_foundations_crypto", 1],
  ["cy_check_hands_on_labs", "res_cy_tryhackme", 0],
  ["cy_check_hands_on_labs", "res_cy_portswigger", 1],
  ["cy_check_specialization", "res_cy_awesome_cyber_security", 0],
  ["cy_check_specialization", "res_cy_nist_sp800_61", 1],

  // HTML5 — semantic tags, document structure, forms, a11y, SEO basics
  ["web_html5", "res_web_mdn_web_docs", 0],
  ["web_html5", "res_html_semantic", 1],
  ["web_html5", "res_web_codewithharry_sigma", 2],

  // CSS3 — box model, selectors, flexbox, grid, responsive
  ["web_css3", "res_web_mdn_web_docs", 0],
  ["web_css3", "res_css_grid", 1],
  ["web_css3", "res_web_codewithharry_sigma", 2],

  // JavaScript (Core) — variables, DOM, events, async, ES6+
  ["web_javascript_core", "res_web_javascript_info", 0],
  ["web_javascript_core", "res_js_async", 1],
  ["web_javascript_core", "res_web_namaste_javascript", 2],
  ["web_javascript_core", "res_web_mdn_web_docs", 3],

  // Git & GitHub — init/commit/push, branch, merge, PRs, forking
  ["web_git_github", "res_git_branching", 0],

  // Dev Tools & Fundamentals — devtools, how the web works, npm
  ["web_dev_tools_fundamentals", "res_web_mdn_web_docs", 0],
  ["web_dev_tools_fundamentals", "res_web_codewithharry_sigma", 1],

  // React.js Fundamentals — JSX, components, useState/useEffect, forms
  ["web_react_fundamentals", "res_web_react_official_docs", 0],
  ["web_react_fundamentals", "res_react_hooks", 1],

  // React — Intermediate — router, custom hooks, Context, fetch + states
  ["web_react_intermediate", "res_web_react_official_docs", 0],
  ["web_react_intermediate", "res_react_hooks", 1],
  ["web_react_intermediate", "res_web_durgesh_blogging_app", 2],

  // React — Advanced — state management, auth flow, code-splitting
  ["web_react_advanced", "res_web_react_official_docs", 0],
  ["web_react_advanced", "res_web_durgesh_blogging_app", 1],

  // Blockchain — teacher/provider nodes. Each node names the exact channel,
  // course, or sheet it points at, so the resource is subject-identical.
  ["bc_patrick_collins", "res_bc_patrick_collins", 0],
  ["bc_daulat_hussain", "res_bc_daulat_hussain", 0],
  ["bc_hackquest", "res_bc_hackquest", 0],
  ["bc_mit_ocw", "res_bc_mit_ocw", 0],
  ["bc_harkirat_cohort", "res_bc_harkirat_100xdevs", 0],
  ["bc_udemy_solidity", "res_bc_udemy_solidity", 0],

  // DSA — each node names the exact sheet/editorial it points at.
  ["dsa_striver", "res_dsa_striver_a2z", 0],
  ["dsa_neetcode_150", "res_dsa_neetcode_150", 0],
  ["dsa_leetcode_codeforces", "res_dsa_leetcode_codeforces", 0],
["dsa_karumahchi", "res_dsa_karumahchi", 0],

  // ── Legacy placeholder nodes still present in migrated databases ─────────
  // Migration 011 seeded seven `node_*` rows (node_html_css, node_javascript,
  // node_git_github, node_react, node_node, node_database, node_deploy). They
  // are NOT in load/roadmap-data/, so no canonical seeder touches them — but
  // they still render in the student's Web roadmap, which is why the Web track
  // showed 10 of 14 covered with four shelves empty. Their ids, titles,
  // ordering and edges are left exactly as they are (deleting them would change
  // the graph); only their study material is filled, from catalogue rows that
  // are genuinely on-topic. All but res_vercel_docs are existing catalogue
  // entries; res_vercel_docs is new and its URL returned HTTP 200.
  ["node_html_css", "res_html_semantic", 0],
  ["node_html_css", "res_css_grid", 1],
  ["node_javascript", "res_web_javascript_info", 0],
  ["node_javascript", "res_js_async", 1],
  ["node_git_github", "res_git_branching", 0],
  ["node_react", "res_web_react_official_docs", 0],
  ["node_react", "res_react_hooks", 1],
  ["node_node", "res_web_postman", 0],
  ["node_database", "res_web_mongodb_university", 0],
  ["node_database", "res_web_dbdiagram_io", 1],
  ["node_deploy", "res_vercel_docs", 0],
];

// Web nodes deliberately left uncovered — no genuine catalogue match exists,
// so they render the honest empty state until mentors curate one.
//   web_css_frameworks      — no Bootstrap/Tailwind resource in the catalogue
//   web_mern_portfolio_projects — full-stack projects not yet catalogued
// No canonical node is intentionally left uncovered: every catalogue node
// now has at least one genuinely relevant, verified resource.
const UNCOVERED_NODES = [];

// New catalogue rows added for AI/ML coverage. Every URL below was
// HTTP-checked (200 after redirects) before being written here.
//   [id, title, kind, level, url]
const NEW_RESOURCES = [
  ["res_ai_sklearn_user_guide", "scikit-learn User Guide", "doc", "foundation_plus", "https://scikit-learn.org/stable/user_guide.html"],
  ["res_ai_sklearn_linear_model", "scikit-learn: Linear Models", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/linear_model.html"],
  ["res_ai_sklearn_ensemble", "scikit-learn: Ensemble Methods", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/ensemble.html"],
  ["res_ai_sklearn_clustering", "scikit-learn: Clustering", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/clustering.html"],
  ["res_ai_sklearn_preprocessing", "scikit-learn: Preprocessing & Feature Engineering", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/preprocessing.html"],
  ["res_ai_sklearn_decomposition", "scikit-learn: Decomposition (PCA) Reference", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/decomposition.html"],
  ["res_ai_sklearn_cross_validation", "scikit-learn: Cross-Validation", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/cross_validation.html"],
  ["res_ai_sklearn_gridsearch", "scikit-learn: GridSearchCV", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GridSearchCV.html"],
  ["res_ai_sklearn_permutation_importance", "scikit-learn: Permutation Feature Importance", "doc", "foundation_plus", "https://scikit-learn.org/stable/modules/permutation_importance.html"],
  ["res_ai_pytorch_docs", "PyTorch Documentation", "doc", "foundation_plus", "https://pytorch.org/docs/stable/index.html"],
  ["res_ai_pytorch_tutorials", "PyTorch Tutorials", "course", "foundation_plus", "https://pytorch.org/tutorials"],
  ["res_ai_keras_guide", "TensorFlow Keras Guide", "doc", "foundation_plus", "https://www.tensorflow.org/guide/keras"],
  ["res_ai_tf_tutorials", "TensorFlow Tutorials", "course", "foundation_plus", "https://www.tensorflow.org/tutorials"],
  ["res_ai_d2l", "Dive into Deep Learning (D2L)", "course", "foundation_plus", "https://d2l.ai/"],
  ["res_ai_3b1b_nn", "3Blue1Brown: Neural Networks", "video", "foundation", "https://www.3blue1brown.com/topics/neural-networks"],
  ["res_ai_cs231n", "Stanford CS231n: Deep Learning for Vision", "course", "foundation_plus", "https://cs231n.github.io/"],
  ["res_ai_colah_lstm", "Understanding LSTM Networks (Colah)", "doc", "foundation_plus", "https://colah.github.io/posts/2015-08-Understanding-LSTMs/"],
  ["res_ai_illustrated_transformer", "The Illustrated Transformer", "doc", "foundation_plus", "https://jalammar.github.io/illustrated-transformer/"],
  ["res_ai_pandas_10min", "Pandas: 10 Minutes to a Data Frame", "doc", "foundation", "https://pandas.pydata.org/docs/user_guide/10min.html"],
  ["res_ai_numpy_docs", "NumPy Documentation", "doc", "foundation", "https://numpy.org/doc/stable/"],
  ["res_ai_xgboost_docs", "XGBoost Documentation", "doc", "foundation_plus", "https://xgboost.readthedocs.io/en/stable/"],
["res_ai_optuna", "Optuna Documentation", "doc", "foundation_plus", "https://optuna.readthedocs.io/"],

  // Cybersecurity — official guidance (OWASP / NIST), authoritative references,
  // and hands-on labs. All HTTP-verified 200 before being written here.
  ["res_cy_owasp_wstg", "OWASP Web Security Testing Guide", "doc", "foundation_plus", "https://owasp.org/www-project-web-security-testing-guide/"],
  ["res_cy_owasp_cheatsheets", "OWASP Cheat Sheet Series", "doc", "foundation_plus", "https://cheatsheetseries.owasp.org/"],
  ["res_cy_nist_sp800_61", "NIST SP 800-61 Rev 3: Incident Handling", "doc", "foundation_plus", "https://csrc.nist.gov/pubs/sp/800/61/r3/final"],
  ["res_cy_nist_sp800_115", "NIST SP 800-115: Security Testing Guide", "doc", "foundation_plus", "https://csrc.nist.gov/pubs/sp/800/115/final"],
  ["res_cy_cryptopals", "CryptoPals Cryptography Challenges", "course", "foundation_plus", "https://cryptopals.com/"],
  ["res_cy_gdb_docs", "GDB Official Documentation", "doc", "foundation_plus", "https://www.gnu.org/software/gdb/documentation/"],
  ["res_cy_linux_man_pages", "Linux man-pages (man7)", "doc", "foundation", "https://man7.org/linux/man-pages/"],
  ["res_cy_python_docs", "Python Official Documentation", "doc", "foundation", "https://docs.python.org/3/"],
  ["res_cy_mdn_http", "MDN: HTTP", "doc", "foundation", "https://developer.mozilla.org/en-US/docs/Web/HTTP"],
  ["res_cy_wireshark_docs", "Wireshark User’s Guide", "doc", "foundation_plus", "https://www.wireshark.org/docs/"],
  ["res_cy_nmap_manual", "Nmap Reference Guide", "doc", "foundation_plus", "https://nmap.org/book/man.html"],

  // Embedded — electronics fundamentals. Every URL HTTP-verified 200.
  // (allaboutcircuits.com returns 403 to scripted checks; the existing
  // catalogue row is reused as-is and is NOT claimed as verified here.)
  ["res_em_mit_ocw_6002", "MIT OpenCourseWare 6.002: Circuits and Electronics", "course", "foundation_plus", "https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/"],
  ["res_em_khan_ee", "Khan Academy: Electrical Engineering", "course", "foundation", "https://www.khanacademy.org/science/electrical-engineering"],
  ["res_em_every_circuit", "EveryCircuit — interactive circuit simulator", "course", "foundation", "https://everycircuit.com/"],
  ["res_em_electronics_notes", "Electronics Notes — component and design reference", "doc", "foundation_plus", "https://www.electronics-notes.com/"],
  ["res_em_mit_ocw_6111", "MIT OpenCourseWare 6.111: Introductory Digital Systems Laboratory", "course", "foundation_plus", "https://ocw.mit.edu/courses/6-111-introductory-digital-systems-laboratory-spring-2006/"],
  ["res_em_arduino_language_reference", "Arduino Language Reference", "doc", "foundation", "https://docs.arduino.cc/language-reference/"],
  ["res_em_c_reference", "cppreference — C language reference", "doc", "foundation_plus", "https://en.cppreference.com/w/c"],
  ["res_em_arduino_digital_pins", "Arduino Docs: Digital Pins", "doc", "foundation", "https://docs.arduino.cc/learn/microcontrollers/digital-pins"],
  ["res_em_arduino_analog_input", "Arduino Docs: Analog Input", "doc", "foundation", "https://docs.arduino.cc/learn/microcontrollers/analog-input"],
  ["res_em_arduino_analog_output", "Arduino Docs: Analog Output", "doc", "foundation", "https://docs.arduino.cc/learn/microcontrollers/analog-output"],
  ["res_em_esp32_gpio_reference", "ESP-IDF: ESP32 GPIO Reference", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html"],
  ["res_em_esp32_i2c_reference", "ESP-IDF: ESP32 I²C Reference", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/i2c.html"],
  ["res_em_esp32_spi_reference", "ESP32 Arduino: SPI API", "doc", "foundation_plus", "https://docs.espressif.com/projects/arduino-esp32/en/latest/api/spi.html"],
  ["res_em_esp32_wifi_api", "ESP32 Arduino: WiFi API", "doc", "foundation_plus", "https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html"],
  ["res_em_esp32_can_reference", "ESP-IDF: ESP32 CAN Reference", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/can.html"],
  ["res_em_esp32_ota_reference", "ESP-IDF: Over-the-Air Updates", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html"],
  ["res_em_esp_idf_guides", "ESP-IDF Programming Guide", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/index.html"],
  ["res_em_sparkfun_relay_tutorial", "SparkFun: How To Use a Relay", "doc", "foundation", "https://learn.sparkfun.com/tutorials/how-to-use-a-relay"],
  ["res_em_sparkfun_i2c_tutorial", "SparkFun: I²C", "doc", "foundation", "https://learn.sparkfun.com/tutorials/i2c"],
  ["res_em_sparkfun_serial_tutorial", "SparkFun: Serial Communication", "doc", "foundation", "https://learn.sparkfun.com/tutorials/serial-communication"],
  ["res_em_mqtt_org", "MQTT.org — the messaging protocol", "doc", "foundation_plus", "https://mqtt.org/"],
  ["res_cy_owasp_iot_top10", "OWASP Internet of Things Project", "doc", "foundation_plus", "https://owasp.org/www-project-internet-of-things/"],
  ["res_em_kicad_schematic_editor", "KiCad 8: Schematic Editor Reference", "doc", "foundation_plus", "https://docs.kicad.org/8.0/en/kicad/kicad.html"],
  ["res_em_kicad_pcbnew", "KiCad 8: PCB Editor Reference", "doc", "foundation_plus", "https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html"],
  ["res_em_freertos_root", "FreeRTOS — official site and kernel documentation", "doc", "foundation_plus", "https://www.freertos.org/"],
  ["res_em_espidf_freertos", "ESP-IDF: FreeRTOS (task/sync) API", "doc", "foundation_plus", "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/freertos.html"],
  ["res_em_keil_mdk", "Keil — MDK toolchain for Arm Cortex-M", "doc", "foundation_plus", "https://www.keil.com/"],
  ["res_em_openocd", "OpenOCD — on-chip debug & flash toolchain", "doc", "foundation_plus", "https://www.openocd.org/"],
  ["res_arduino_hardware_docs", "Arduino Docs: Hardware", "doc", "foundation", "https://docs.arduino.cc/hardware/"],
  ["res_arduino_store", "Arduino Store — official boards and kits", "doc", "foundation", "https://store.arduino.cc/"],
  ["res_pi_projects", "Raspberry Pi Projects", "course", "foundation", "https://projects.raspberrypi.org/en"],
  ["res_pi_magazine", "The MagPi Magazine (official Raspberry Pi magazine)", "article", "foundation", "https://magazine.raspberrypi.com"],
  // Project-specific MagPi showcases — each URL verified HTTP 200 with a
  // matching page title. Used alongside the official project hubs.
  ["res_pi_tide_clock", "MagPi: Moon and tide clock", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/moon-and-tide-clock"],
  ["res_pi_whisper_of_moths", "MagPi: A Whisper of Moths", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/a-whisper-of-moths"],
  ["res_pi_chord_assist", "MagPi: Chord Assist", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/chord-assist"],
  ["res_pi_smart_home_herb_garden", "MagPi: Smart Home Herb Garden", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/smart-home-herb-garden"],
  ["res_pi_marvin_go_kart", "MagPi: Marvin Go-Kart", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/marvin-go-kart"],
  ["res_pi_tortoise_fridge", "MagPi: Tortoise Fridge", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/tortoise-fridge"],
  ["res_pi_immersive_bar", "MagPi: Immersive Bar", "article", "foundation_plus", "https://magazine.raspberrypi.com/articles/immersive-bar"],

  // Web nodes previously held for lack of verified material.
  ["res_web_bootstrap_docs", "Bootstrap 5 Documentation", "doc", "foundation", "https://getbootstrap.com/docs/5.3/"],
  ["res_web_tailwind_docs", "Tailwind CSS Documentation", "doc", "foundation", "https://tailwindcss.com/docs"],

  // Deployment material for the legacy `node_deploy` node, which had no
  // deployment resource in the catalogue at all. Official hosting docs,
  // HTTP 200 at the time of writing.
  ["res_vercel_docs", "Vercel Documentation", "doc", "intermediate", "https://vercel.com/docs"],
];

// `resources.domain` is the catalogue grouping shown on resource pages. The
// id-prefix heuristic below is a fallback only: a row whose subject does not
// match its prefix (a deployment guide is not AI/ML) must be listed here, or it
// gets filed under the wrong domain forever.
const RESOURCE_DOMAINS = {
  res_vercel_docs: "devops",
};

function defaultDomainFor(id) {
  if (id.startsWith("res_cy_")) return "cybersecurity";
  if (id.startsWith("res_em_")) return "embedded";
  return "ai_ml";
}

async function main() {
  const path = require("path");
  const fs = require("fs");
  let fromEnvFile = false;
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
        // Only DATABASE_URL matters for the "which database am I touching"
        // message below; other keys falling back is unremarkable.
        if (m[1] === "DATABASE_URL") fromEnvFile = true;
      }
    }
  } catch { /* env only */ }
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
const sql = postgres(url, { max: 1 });
  try {
    // Name the target host only — never the password. The operator must be
    // able to see WHICH database is about to be written to.
    let targetHost = "(unparsed)";
    try { targetHost = new URL(url).host; } catch { /* keep placeholder */ }
    console.log(
      `target: ${targetHost}${fromEnvFile ? " (DATABASE_URL came from .env.local — confirm this is the intended database)" : " (DATABASE_URL from environment)"}`
    );

    // Pre-flight: this script only writes roadmap_node_resources. If the
    // migration has not run, say exactly that instead of surfacing a raw
    // Postgres error halfway through the writes.
    const [table] = await sql`SELECT to_regclass('public.roadmap_node_resources')::text AS t`;
    if (!table) {
      console.error("roadmap_node_resources does not exist. Run the migration first:");
      console.error("  node load/migrate.js      (or: npm run db:migrate)");
      console.error("Refusing to seed a schema that is not migrated.");
      process.exit(1);
    }

    // One transaction for the whole seed: catalogue upserts and 800+ mappings
    // either all land or none do, so a re-run can never leave the shelf half
    // populated.
    //
    // Order matters and was a real bug: the existence check used to run BEFORE
    // the catalogue upsert, so on a clean database it always aborted — most
    // referenced resources (the cyber/embedded rows and every NEW_RESOURCES
    // entry) are created by this very script. Upsert first, then verify, then
    // map; a failed check throws and rolls the whole thing back.
    const nodeIds = [...new Set(LINKS.map(([n]) => n))];
    const resIds = [...new Set(LINKS.map(([, r]) => r))];

    try {
      await sql.begin(async (tx) => {
        for (const [id, title, kind, level, resourceUrl] of NEW_RESOURCES) {
          const domain = RESOURCE_DOMAINS[id] ?? defaultDomainFor(id);
          await tx`INSERT INTO resources (id, title, domain, kind, level, url)
            VALUES (${id}, ${title}, ${domain}, ${kind}, ${level}, ${resourceUrl})
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, domain = EXCLUDED.domain,
              kind = EXCLUDED.kind, level = EXCLUDED.level, url = EXCLUDED.url`;
        }

        // Safety: every referenced id must exist — never invent mappings onto
        // rows that are not really there.
        const nodes = await tx`SELECT id FROM roadmap_nodes WHERE id = ANY(${nodeIds})`;
        const foundNodes = new Set(nodes.map((n) => n.id));
        const missingNodes = nodeIds.filter((id) => !foundNodes.has(id));
        const res = await tx`SELECT id FROM resources WHERE id = ANY(${resIds})`;
        const foundRes = new Set(res.map((r) => r.id));
        const missingRes = resIds.filter((id) => !foundRes.has(id));
        if (missingNodes.length || missingRes.length) {
          const sample = (list) =>
            `${list.length} missing (e.g. ${list.slice(0, 3).join(", ")}${list.length > 3 ? ", …" : ""})`;
          throw new Error(
            `referenced rows are absent — nodes: ${sample(missingNodes)}; resources: ${sample(missingRes)}. ` +
            "Canonical nodes and resources come from load/seed-roadmaps.js — run that first."
          );
        }

        for (const [nodeId, resourceId, sortOrder] of LINKS) {
          await tx`INSERT INTO roadmap_node_resources (node_id, resource_id, sort_order)
            VALUES (${nodeId}, ${resourceId}, ${sortOrder})
            ON CONFLICT DO NOTHING`;
        }
      });
    } catch (e) {
      console.error(`seed-node-resources aborted, nothing written: ${e.message}`);
      process.exit(1);
    }
    if (NEW_RESOURCES.length) console.log(`upserted ${NEW_RESOURCES.length} catalogue resources`);

    // Post-conditions. A seed that "succeeded" but produced orphan or
    // duplicate rows is a failed seed and must not exit 0.
    const [count] = await sql`SELECT COUNT(*)::int AS n FROM roadmap_node_resources`;
    const [orphans] = await sql`
      SELECT COUNT(*)::int AS n FROM roadmap_node_resources m
      WHERE NOT EXISTS (SELECT 1 FROM roadmap_nodes n WHERE n.id = m.node_id)
         OR NOT EXISTS (SELECT 1 FROM resources r WHERE r.id = m.resource_id)`;
    const [dupes] = await sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT node_id, resource_id FROM roadmap_node_resources
        GROUP BY node_id, resource_id HAVING COUNT(*) > 1) d`;
    console.log(`seed-node-resources: ${LINKS.length} links across ${nodeIds.length} nodes; table now holds ${count.n} rows`);
    if (orphans.n > 0 || dupes.n > 0) {
      console.error(`seed-node-resources FAILED verification: ${orphans.n} orphan rows, ${dupes.n} duplicate pairs`);
      process.exit(1);
    }
    console.log("seed-node-resources: verified - 0 orphans, 0 duplicate pairs");
  } finally {
    await sql.end();
  }
}

module.exports = { LINKS, NEW_RESOURCES, UNCOVERED_NODES };

if (typeof require !== "undefined" && require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
