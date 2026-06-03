<?php
/**
 * Plugin Name:       Bricks Floating Panels
 * Plugin URI:        https://truemtn.com/
 * Description:        Turns the Bricks builder Settings panel and Structure panel into draggable, resizable floating overlays so they stop squeezing the canvas. Toggle on/off from the toolbar button or with Cmd/Ctrl + Shift + F.
 * Version:           1.8.2
 * Author:            True Mtn Marketing
 * Author URI:        https://truemtn.com/
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

define( 'BFP_VERSION', '1.8.2' );
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
		if ( ! file_exists( $lib ) || false !== strpos( BFP_GITHUB_REPO, 'iamjohnwhite' ) ) {
			return; // Not set up yet: stay dormant.
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
