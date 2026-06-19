// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const path = require('path');

const {
    createFlatRuleOperations,
    createInstallTargetAdapter,
    isForeignPlatformPath,
} = require('./helpers');

module.exports = createInstallTargetAdapter({
    id: 'codebuddy-project',
    target: 'codebuddy',
    kind: 'project',
    rootSegments: ['.codebuddy'],
    installStatePathSegments: ['ecc-install-state.json'],
    nativeRootRelativePath: '.codebuddy',
    planOperations(input, adapter) {
        const modules = Array.isArray(input.modules)
            ? input.modules
            : input.module
              ? [input.module]
              : [];
        const { repoRoot, projectRoot, homeDir } = input;
        const planningInput = {
            repoRoot,
            projectRoot,
            homeDir,
        };
        const targetRoot = adapter.resolveRoot(planningInput);

        return modules.flatMap((module) => {
            const paths = Array.isArray(module.paths) ? module.paths : [];
            return paths
                .filter((p) => !isForeignPlatformPath(p, adapter.target))
                .flatMap((sourceRelativePath) => {
                    if (sourceRelativePath === 'rules') {
                        return createFlatRuleOperations({
                            moduleId: module.id,
                            repoRoot,
                            sourceRelativePath,
                            destinationDir: path.join(targetRoot, 'rules'),
                        });
                    }

                    return [
                        adapter.createScaffoldOperation(
                            module.id,
                            sourceRelativePath,
                            planningInput
                        ),
                    ];
                });
        });
    },
});
