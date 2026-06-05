<?php
/**
 * Plugin Name:       BFP Bricks Floating Panels
 * Plugin URI:        https://iamjohnwhite.com
 * Description:        Turns the Bricks builder Settings panel and Structure panel into draggable, resizable floating overlays so they stop squeezing the canvas. Toggle on/off from the toolbar button or with Cmd/Ctrl + Shift + F.
 * Version:           2.0.7
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

define( 'BFP_VERSION', '2.0.7' );
define( 'BFP_URL', plugin_dir_url( __FILE__ ) );
define( 'BFP_PATH', plugin_dir_path( __FILE__ ) );

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
			BFP_URL . 'assets/floating-panels.css',
			array(),
			BFP_VERSION
		);

		wp_enqueue_script(
			'bfp-floating-panels',
			BFP_URL . 'assets/floating-panels.js',
			array(),
			BFP_VERSION,
			true
		);

		/**
		 * Pass settings to the script. Default state can be forced on/off with
		 * the bfp_default_active filter if you ever want it enabled by default.
		 */
		wp_localize_script(
			'bfp-floating-panels',
			'BFP_SETTINGS',
			array(
				'defaultActive' => (bool) apply_filters( 'bfp_default_active', false ),
				'version'       => BFP_VERSION,
				'options'       => bfp_get_options(),
			)
		);
	},
	100
);


if ( ! defined( 'BFP_GITHUB_REPO' ) ) {
	define( 'BFP_GITHUB_REPO', 'https://github.com/iamjohnwhite/bricks-floating-panels/' );
}
add_action(
	'init',
	function () {
		$lib = BFP_PATH . 'plugin-update-checker/plugin-update-checker.php';
		if ( ! file_exists( $lib ) ) {
			return; // Update checker library missing: stay dormant.
		}
		require_once $lib;
		if ( ! class_exists( '\\YahnisElsts\\PluginUpdateChecker\\v5\\PucFactory' ) ) {
			return;
		}
		$checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
			BFP_GITHUB_REPO,
			__FILE__,
			'bricks-floating-panels'
		);
		if ( method_exists( $checker, 'setBranch' ) ) {
			$checker->setBranch( 'main' );
		}
	}
);

/* =========================================================================
 * Settings (2.0): dashboard options page + stored option, read by the builder.
 * ========================================================================= */

/**
 * Default option values. All new 2.0 features are OFF by default so the base
 * experience is unchanged unless a user opts in.
 */
function bfp_default_options() {
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

function bfp_get_options() {
	return wp_parse_args( get_option( 'bfp_options', array() ), bfp_default_options() );
}

function bfp_sanitize_options( $in ) {
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
		register_setting( 'bfp_options_group', 'bfp_options', array( 'sanitize_callback' => 'bfp_sanitize_options' ) );
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
			'Floating Panels',
			'Floating Panels',
			'manage_options',
			'bfp-settings',
			'bfp_render_settings_page'
		);
	},
	100
);

function bfp_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o = bfp_get_options();
	?>
	<div class="wrap">
		<h1>BFP Bricks Floating Panels</h1>
		<div class="notice notice-warning inline" style="margin:14px 0;padding:10px 12px;">
			<p style="margin:0;"><strong>Beta features.</strong> The options below are still in active development and may change or have rough edges. Everything is off by default, so your core floating panels are unaffected unless you opt in.</p>
		</div>
		<p>These are optional add-ons to the core floating panels. Turn on only what you want, so the builder isn't cluttered.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'bfp_options_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">Panel transparency</th>
					<td>
						<label><input type="checkbox" name="bfp_options[transparency]" value="1" <?php checked( $o['transparency'], 1 ); ?>> Make floating panels see-through</label>
						<p class="description">Lets the canvas show through the panels so you can preview while editing.</p>
						<p style="margin-top:10px;">
							<label>Opacity:
								<input type="range" name="bfp_options[opacity]" min="10" max="100" value="<?php echo esc_attr( $o['opacity'] ); ?>" oninput="this.nextElementSibling.value=this.value+'%'">
								<output><?php echo esc_html( $o['opacity'] ); ?>%</output>
							</label>
							<br><span class="description">Lower = more see-through. 100% = solid. <strong>Recommended: around 80%.</strong> A droplet toggle appears on floating panel title bars to flip it on/off while you work.</span>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Avoid the selected element</th>
					<td>
						<label><input type="checkbox" name="bfp_options[avoid_overlap]" value="1" <?php checked( $o['avoid_overlap'], 1 ); ?>> Move a floating panel aside if it covers the element you select</label>
						<p style="margin-top:10px;">
							<label>Apply to:
								<select name="bfp_options[avoid_which]">
									<option value="both" <?php selected( $o['avoid_which'], 'both' ); ?>>Both panels</option>
									<option value="settings" <?php selected( $o['avoid_which'], 'settings' ); ?>>Settings only</option>
									<option value="structure" <?php selected( $o['avoid_which'], 'structure' ); ?>>Structure only</option>
								</select>
							</label>
							<br><span class="description">Leave one panel put while the other gets out of the way.</span>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Dock both panels to one side</th>
					<td>
						<label><input type="checkbox" name="bfp_options[stack]" value="1" <?php checked( $o['stack'], 1 ); ?>> Stack Settings and Structure together on one side</label>
						<p style="margin-top:10px;">
							<label>Side:
								<select name="bfp_options[stack_side]">
									<option value="right" <?php selected( $o['stack_side'], 'right' ); ?>>Right</option>
									<option value="left" <?php selected( $o['stack_side'], 'left' ); ?>>Left</option>
								</select>
							</label>
							&nbsp;&nbsp;
							<label>Layout:
								<select name="bfp_options[stack_layout]">
									<option value="stacked" <?php selected( $o['stack_layout'], 'stacked' ); ?>>Stacked (both visible)</option>
									<option value="tabbed" <?php selected( $o['stack_layout'], 'tabbed' ); ?>>Tabbed (one at a time)</option>
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
