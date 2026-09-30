// Repository records are intentionally narrowed here because seed data is fixed installation content.
// @ts-nocheck
import { defineSeed } from '@nocobase/db';

export default defineSeed({
  name: '202609290002_quality_defaults',
  async run({ repository }) {
    const projects = repository('qcProjects');
    const platformResult = await projects.createOne({
      values: {
        key: 'platform-quality',
        name: 'NocoBase 质量测试',
        type: 'platform',
        description: '平台功能、搭建与升级的质量标准',
      },
    });
    const platform: any = platformResult.record ?? platformResult;
    const schoolResult = await projects.createOne({
      values: {
        key: 'school-business',
        name: '学校业务测试',
        type: 'business',
        description: '用业务流程验证通用质量模型',
      },
    });
    const school: any = schoolResult.record ?? schoolResult;
    const dims = repository('qcDimensions');
    const platformDims = [
      ['design', '设计合理性'],
      ['development', '开发完整性'],
      ['agent-friendly', 'Agent 使用友好度'],
      ['output', 'Agent 产出质量'],
    ];
    for (let i = 0; i < platformDims.length; i++)
      await dims.createOne({
        values: {
          projectId: platform.id,
          key: platformDims[i][0],
          name: platformDims[i][1],
          position: i,
        },
      });
    await dims.createOne({
      values: {
        projectId: school.id,
        key: 'business-flow',
        name: '主流程验收',
        position: 0,
      },
    });
    const objects = repository('qcObjects');
    for (const [key, name, category] of [
      ['authorization', '授权数据库认证', 'feature'],
      ['file-storage', '文件存储', 'feature'],
      ['app-build', '应用搭建', 'build'],
      ['upgrade', '版本升级', 'upgrade'],
    ])
      await objects.createOne({
        values: { projectId: platform.id, key, name, category },
      });
    for (const [key, name] of [
      ['meal-card', '饭卡主流程'],
      ['student-attendance', '学生考勤'],
      ['teacher-attendance', '教师考勤'],
    ])
      await objects.createOne({
        values: { projectId: school.id, key, name, category: 'business' },
      });
    const designResult = await dims.findOne({
      filter: { projectId: platform.id, key: 'design' },
    });
    const design: any = designResult?.record ?? designResult;
    const authResult = await objects.findOne({
      filter: { projectId: platform.id, key: 'authorization' },
    });
    const auth: any = authResult?.record ?? authResult;
    const checkResult = await repository('qcChecks').createOne({
      values: {
        projectId: platform.id,
        objectId: auth.id,
        dimensionId: design.id,
        key: 'authorization-api-contract',
        name: '认证 API 契约与错误边界',
      },
    });
    const check: any = checkResult.record ?? checkResult;
    await repository('qcStandards').createOne({
      values: {
        checkId: check.id,
        version: 1,
        definition: '验证认证接口在成功、未授权和无效凭据场景下遵循公开契约。',
        preconditions: '准备可访问的测试环境与目标提交。',
        steps:
          '1. 执行认证接口成功请求。\n2. 执行无效凭据请求。\n3. 核对状态码、响应结构和日志。',
        passCriteria: '成功和失败边界均符合标准，证据可复核。',
        evidence: '请求与响应、测试日志、目标提交。',
        humanReview: true,
      },
    });
  },
});
