// 일부 AI SDK 패키지가 publish 된 tarball 에 d.ts 를 빠뜨려서 (ts7016) 빌드가 막힘.
// 런타임은 정상 동작하므로 모듈 선언만 채워주는 shim.
// 패키지가 d.ts 를 정상 publish 하기 시작하면 이 파일은 제거 가능.
declare module "@ai-sdk/google";
declare module "ai";
