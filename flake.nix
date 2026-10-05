{
  description = "hima PPL planner";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, rust-overlay, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system:
          f (import nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          }));
    in
    {
      devShells = forAllSystems (pkgs:
        let
          toolchain = pkgs.rust-bin.stable."1.95.0".default.override {
            extensions = [ "clippy" "rust-src" "rustfmt" ];
            targets = [ "wasm32-unknown-unknown" ];
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              toolchain
              pkgs.dioxus-cli
              pkgs.binaryen
              pkgs.rust-analyzer
              pkgs.pkg-config
              pkgs.stdenv.cc
            ];

            CARGO_TERM_COLOR = "always";
            RUST_BACKTRACE = "1";

            shellHook = ''
              echo "hima Dioxus development environment"
              echo "  dx serve --platform web            Run the app with live reload"
              echo "  dx build --platform web --release  Build the production web app"
              echo "  cargo test                         Run the calculation tests"
            '';
          };
        });

      apps = forAllSystems (pkgs:
        let
          toolchain = pkgs.rust-bin.stable."1.95.0".default.override {
            targets = [ "wasm32-unknown-unknown" ];
          };
          serve = pkgs.writeShellApplication {
            name = "hima";
            runtimeInputs = [ toolchain pkgs.dioxus-cli pkgs.binaryen pkgs.stdenv.cc ];
            text = ''
              exec dx serve --platform web "$@"
            '';
          };
        in
        {
          default = {
            type = "app";
            program = "${serve}/bin/hima";
            meta.description = "Run the hima development server";
          };
        });
    };
}
