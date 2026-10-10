{
  description = "hima PPL planner";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs {
        inherit system;
        overlays = [ (final: prev: {
          # Keep Nix aligned with package.json until nixpkgs includes this release.
          pnpm_12 = final.stdenvNoCC.mkDerivation {
            pname = "pnpm";
            version = "12.10.1";
            src = final.fetchurl {
              url = "https://github.com/pnpm/pnpm/releases/download/v12.10.1/pnpm-linux-${if system == "x86_64-linux" then "x64" else "arm64"}.tar.gz";
              hash = {
                x86_64-linux = "sha256-UConWYSkzQHlV5rHIEmiQQkcrFEY5Evs+ElREww+B54=";
                aarch64-linux = "sha256-GNuxGN4dvvDkUWwXv4R9buIG/E3v+yu0iOyOHSgU4Hg=";
              }.${system};
            };
            sourceRoot = ".";
            nativeBuildInputs = [ final.autoPatchelfHook final.makeWrapper ];
            buildInputs = [ final.stdenv.cc.cc.lib ];
            installPhase = ''
              runHook preInstall
              mkdir -p "$out/bin"
              cp pnpm "$out/bin/pnpm"
              cp -r dist "$out/bin/dist"
              makeWrapper "$out/bin/pnpm" "$out/bin/pnpx" --add-flag dlx
              ln -s "$out/bin/pnpm" "$out/bin/pn"
              ln -s "$out/bin/pnpx" "$out/bin/pnx"
              runHook postInstall
            '';
            passthru = {
              majorVersion = "12";
              nodejs-slim = final.nodejs-slim;
            };
            meta = prev.pnpm_12.meta;
          };
        }) ];
      }));
    in
    {
      packages = forAllSystems (pkgs:
        rec {
          default = frontend;
          backend = pkgs.rustPlatform.buildRustPackage {
            pname = "hima-api";
            version = "0.1.0";
            src = pkgs.lib.cleanSource ./backend;
            cargoLock.lockFile = ./backend/Cargo.lock;
            nativeBuildInputs = [ pkgs.pkg-config ];
            buildInputs = [ pkgs.openssl ];
            # CI runs the test suite in the backend job; skip the second release-mode test build.
            doCheck = false;
            meta.description = "hima API and embedded PostgreSQL migration executable";
          };
          frontend = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "hima";
            version = "1.0.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = path: type:
                pkgs.lib.cleanSourceFilter path type
                && !(builtins.elem (builtins.baseNameOf path) [ "node_modules" "dist" ".vite" "coverage" ]);
            };

            nodejs = pkgs.nodejs_22;
            nativeBuildInputs = [ pkgs.nodejs_22 pkgs.pnpm_12 pkgs.pnpmConfigHook ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              pnpm = pkgs.pnpm_12;
              fetcherVersion = 4;
              hash = "sha256-E+BMGjZ/fnPxu8HzZKwUCbDfhPxgol11oneQGH5aJs0=";
            };

            buildPhase = ''
              runHook preBuild
              pnpm run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -r dist "$out/dist"
              runHook postInstall
            '';

            meta.description = "Built hima static website";
          });
        });

      devShells = forAllSystems (pkgs:
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22 pkgs.pnpm_12
              pkgs.cargo pkgs.rustc pkgs.rustfmt pkgs.clippy pkgs.rust-analyzer
              pkgs.pkg-config pkgs.openssl pkgs.postgresql_17 pkgs.curl
            ];

            shellHook = ''
              echo "hima frontend + Rust API development environment"
              echo "  pnpm run dev    Run the app with live reload"
              echo "  pnpm test       Run the calculation tests"
              echo "  pnpm run build  Build the production web app"
              echo "  cargo run --manifest-path backend/Cargo.toml  Run the API"
            '';
          };
        });

      apps = forAllSystems (pkgs:
        {
          default = {
            type = "app";
            program = "${pkgs.writeShellApplication {
              name = "hima";
              runtimeInputs = [ pkgs.nodejs_22 pkgs.pnpm_12 ];
              text = ''exec pnpm run dev "$@"'';
            }}/bin/hima";
            meta.description = "Run the hima development server";
          };
        });
    };
}
