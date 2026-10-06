{
  description = "hima PPL planner";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      devShells = forAllSystems (pkgs:
        {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_22 ];

            shellHook = ''
              echo "hima React + TypeScript development environment"
              echo "  npm run dev    Run the app with live reload"
              echo "  npm test       Run the calculation tests"
              echo "  npm run build  Build the production web app"
            '';
          };
        });

      apps = forAllSystems (pkgs:
        {
          default = {
            type = "app";
            program = "${pkgs.writeShellApplication {
              name = "hima";
              runtimeInputs = [ pkgs.nodejs_22 ];
              text = ''exec npm run dev -- "$@"'';
            }}/bin/hima";
            meta.description = "Run the hima development server";
          };
        });
    };
}
