<?php
/**
 * Plugin Name:       Floating Panels for Bricks
 * Plugin URI:        https://github.com/iamjohnwhite/bricks-floating-panels
 * Description:        Turns the Bricks builder Settings panel and Structure panel into draggable, resizable floating overlays so they stop squeezing the canvas. Toggle on/off from the toolbar button or with Cmd/Ctrl + Shift + F.
 * Version:           2.0.14
 * Author:            John White
 * Author URI:        https://iamjohnwhite.com
 * License:           GPL-2.0-or-later
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Text Domain:       bricks-floating-panels
 *
 * This plugin only loads inside the Bricks builder interface. It never touches
 * the front end of the site, and all behavior can be turned off in two ways:
 *   1. Per session: click the toolbar toggle (or press Cmd/Ctrl + Shift + F).
 *   2. Globally: deactivate this plugin from Plugins.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'BFPANELS_VERSION', '2.0.14' );
define( 'BFPANELS_URL', plugin_dir_url( __FILE__ ) );
define( 'BFPANELS_PATH', plugin_dir_path( __FILE__ ) );

/**
 * Load assets only inside the Bricks builder main window.
 *
 * Bricks loads the builder on the front end (?bricks=run), so wp_enqueue_scripts
 * is the correct hook. bricks_is_builder_main() is true only for the outer
 * builder UI window (where the panels live), not the canvas iframe or the
 * published page, so the overlay logic never leaks anywhere it should not.
 */
add_action(
	'wp_enqueue_scripts',
	function () {
		// Bail if Bricks is not active or we are not in the builder UI.
		if ( ! function_exists( 'bricks_is_builder_main' ) || ! bricks_is_builder_main() ) {
			return;
		}

		wp_enqueue_style(
			'bfp-floating-panels',
			BFPANELS_URL . 'assets/floating-panels.css',
			array(),
			BFPANELS_VERSION
		);

		wp_enqueue_script(
			'bfp-floating-panels',
			BFPANELS_URL . 'assets/floating-panels.js',
			array(),
			BFPANELS_VERSION,
			true
		);

		/**
		 * Pass settings to the script. Default state can be forced on/off with
		 * the bfpanels_default_active filter if you ever want it enabled by default.
		 */
		wp_localize_script(
			'bfp-floating-panels',
			'BFP_SETTINGS',
			array(
				'defaultActive' => (bool) apply_filters( 'bfpanels_default_active', false ),
				'version'       => BFPANELS_VERSION,
				'options'       => bfpanels_get_options(),
			)
		);
	},
	100
);


/* BFP-GH-UPDATER-START (this whole block is stripped from the WordPress.org build) */
if ( ! defined( 'BFPANELS_GITHUB_REPO' ) ) {
	define( 'BFPANELS_GITHUB_REPO', 'https://github.com/iamjohnwhite/bricks-floating-panels/' );
}
add_action(
	'init',
	function () {
		$lib = BFPANELS_PATH . 'plugin-update-checker/plugin-update-checker.php';
		if ( ! file_exists( $lib ) ) {
			return; // Update checker library missing: stay dormant.
		}
		require_once $lib;
		if ( ! class_exists( '\\YahnisElsts\\PluginUpdateChecker\\v5\\PucFactory' ) ) {
			return;
		}
		$checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
			BFPANELS_GITHUB_REPO,
			__FILE__,
			'bricks-floating-panels'
		);
		if ( method_exists( $checker, 'setBranch' ) ) {
			$checker->setBranch( 'main' );
		}
	}
);
/* BFP-GH-UPDATER-END */

/* =========================================================================
 * Settings (2.0): dashboard options page + stored option, read by the builder.
 * ========================================================================= */

/**
 * Default option values. All new 2.0 features are OFF by default so the base
 * experience is unchanged unless a user opts in.
 */
function bfpanels_default_options() {
	return array(
		'transparency'        => 0,        // panel see-through on/off
		'opacity'             => 80,       // main panel opacity (10-100)
		'avoid_overlap'       => 0,        // move panels off the selected element
		'avoid_which'         => 'both',   // 'both' | 'settings' | 'structure'
		'stack'               => 0,        // dock both panels to one side
		'stack_side'          => 'right',  // 'left' | 'right'
		'stack_layout'        => 'stacked' // 'stacked' | 'tabbed'
	);
}

function bfpanels_get_options() {
	return wp_parse_args( get_option( 'bfp_options', array() ), bfpanels_default_options() );
}

function bfpanels_sanitize_options( $in ) {
	$in = is_array( $in ) ? $in : array();
	$out = array();
	$out['transparency']        = empty( $in['transparency'] ) ? 0 : 1;
	$out['opacity']             = max( 10, min( 100, isset( $in['opacity'] ) ? intval( $in['opacity'] ) : 80 ) );
	$out['avoid_overlap']       = empty( $in['avoid_overlap'] ) ? 0 : 1;
	$out['avoid_which']         = in_array( ( isset( $in['avoid_which'] ) ? $in['avoid_which'] : '' ), array( 'both', 'settings', 'structure' ), true ) ? $in['avoid_which'] : 'both';
	$out['stack']               = empty( $in['stack'] ) ? 0 : 1;
	$out['stack_side']          = ( isset( $in['stack_side'] ) && 'left' === $in['stack_side'] ) ? 'left' : 'right';
	$out['stack_layout']        = ( isset( $in['stack_layout'] ) && 'tabbed' === $in['stack_layout'] ) ? 'tabbed' : 'stacked';
	return $out;
}

add_action(
	'admin_init',
	function () {
		register_setting( 'bfp_options_group', 'bfp_options', array( 'sanitize_callback' => 'bfpanels_sanitize_options' ) );
	}
);

/**
 * Add the settings page under the Bricks menu if present, otherwise under
 * Settings, so it is always reachable.
 */
add_action(
	'admin_menu',
	function () {
		$parent = isset( $GLOBALS['admin_page_hooks']['bricks'] ) ? 'bricks' : 'options-general.php';
		add_submenu_page(
			$parent,
			__( 'Floating Panels for Bricks', 'bricks-floating-panels' ),
			__( 'Floating Panels', 'bricks-floating-panels' ),
			'manage_options',
			'bfp-settings',
			'bfpanels_render_settings_page'
		);
	},
	100
);

function bfpanels_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o = bfpanels_get_options();
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'Floating Panels for Bricks', 'bricks-floating-panels' ); ?></h1>
		<div class="notice notice-warning inline" style="margin:14px 0;padding:10px 12px;">
			<p style="margin:0;"><strong><?php echo esc_html__( 'Beta features.', 'bricks-floating-panels' ); ?></strong> <?php echo esc_html__( 'The options below are still in active development and may change or have rough edges. Everything is off by default, so your core floating panels are unaffected unless you opt in.', 'bricks-floating-panels' ); ?></p>
		</div>
		<p><?php echo esc_html__( 'These are optional add-ons to the core floating panels. Turn on only what you want, so the builder is not cluttered.', 'bricks-floating-panels' ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'bfp_options_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php echo esc_html__( 'Panel transparency', 'bricks-floating-panels' ); ?></th>
					<td>
						<label><input type="checkbox" name="bfp_options[transparency]" value="1" <?php checked( $o['transparency'], 1 ); ?>> <?php echo esc_html__( 'Make floating panels see-through', 'bricks-floating-panels' ); ?></label>
						<p class="description"><?php echo esc_html__( 'Lets the canvas show through the panels so you can preview while editing.', 'bricks-floating-panels' ); ?></p>
						<p style="margin-top:10px;">
							<label><?php echo esc_html__( 'Opacity:', 'bricks-floating-panels' ); ?>
								<input type="range" name="bfp_options[opacity]" min="10" max="100" value="<?php echo esc_attr( $o['opacity'] ); ?>" oninput="this.nextElementSibling.value=this.value+'%'">
								<output><?php echo esc_html( $o['opacity'] ); ?>%</output>
							</label>
							<br><span class="description"><?php echo esc_html__( 'Lower = more see-through. 100% = solid. Recommended: around 80%. A droplet toggle appears on floating panel title bars to flip it on/off while you work.', 'bricks-floating-panels' ); ?></span>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php echo esc_html__( 'Avoid the selected element', 'bricks-floating-panels' ); ?></th>
					<td>
						<label><input type="checkbox" name="bfp_options[avoid_overlap]" value="1" <?php checked( $o['avoid_overlap'], 1 ); ?>> <?php echo esc_html__( 'Move a floating panel aside if it covers the element you select', 'bricks-floating-panels' ); ?></label>
						<p style="margin-top:10px;">
							<label><?php echo esc_html__( 'Apply to:', 'bricks-floating-panels' ); ?>
								<select name="bfp_options[avoid_which]">
									<option value="both" <?php selected( $o['avoid_which'], 'both' ); ?>><?php echo esc_html__( 'Both panels', 'bricks-floating-panels' ); ?></option>
									<option value="settings" <?php selected( $o['avoid_which'], 'settings' ); ?>><?php echo esc_html__( 'Settings only', 'bricks-floating-panels' ); ?></option>
									<option value="structure" <?php selected( $o['avoid_which'], 'structure' ); ?>><?php echo esc_html__( 'Structure only', 'bricks-floating-panels' ); ?></option>
								</select>
							</label>
							<br><span class="description"><?php echo esc_html__( 'Leave one panel put while the other gets out of the way.', 'bricks-floating-panels' ); ?></span>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php echo esc_html__( 'Dock both panels to one side', 'bricks-floating-panels' ); ?></th>
					<td>
						<label><input type="checkbox" name="bfp_options[stack]" value="1" <?php checked( $o['stack'], 1 ); ?>> <?php echo esc_html__( 'Stack Settings and Structure together on one side', 'bricks-floating-panels' ); ?></label>
						<p style="margin-top:10px;">
							<label><?php echo esc_html__( 'Side:', 'bricks-floating-panels' ); ?>
								<select name="bfp_options[stack_side]">
									<option value="right" <?php selected( $o['stack_side'], 'right' ); ?>><?php echo esc_html__( 'Right', 'bricks-floating-panels' ); ?></option>
									<option value="left" <?php selected( $o['stack_side'], 'left' ); ?>><?php echo esc_html__( 'Left', 'bricks-floating-panels' ); ?></option>
								</select>
							</label>
							&nbsp;&nbsp;
							<label><?php echo esc_html__( 'Layout:', 'bricks-floating-panels' ); ?>
								<select name="bfp_options[stack_layout]">
									<option value="stacked" <?php selected( $o['stack_layout'], 'stacked' ); ?>><?php echo esc_html__( 'Stacked (both visible)', 'bricks-floating-panels' ); ?></option>
									<option value="tabbed" <?php selected( $o['stack_layout'], 'tabbed' ); ?>><?php echo esc_html__( 'Tabbed (one at a time)', 'bricks-floating-panels' ); ?></option>
								</select>
							</label>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
