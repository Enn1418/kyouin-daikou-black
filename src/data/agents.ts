import { USER_COLOR } from '../theme/brand';
import { DEFAULT_MODELS } from '../core/llm/constants';

import { SPECIAL_NEEDS_SETS } from './teacherAgents';

export const USER_ID = 'user';
export const USER_NAME = 'User';
// 役割を細かく区切って人数を増やしたい（担任の要望）ので、1部屋の上限は10人。
export const MAX_AGENTS = 10;
export { USER_COLOR };
/**
 * 起動時に選ばれているチーム。このリポジトリは特別支援学級の教材作成が主目的なので、
 * 主力の「特支・同時異教材室」を既定にする。
 * （以前は存在しない 'single-agent' を指しており、常に AGENTIC_SETS[0] へフォールバックしていた）
 */
export const DEFAULT_AGENTIC_SET_ID = 'sn-multi-tier';
export interface AgentNode {
  id: string;
  index: number;
  name: string;
  description: string;
  color: string;
  model: string;
  humanInTheLoop?: boolean;
  position?: { x: number; y: number };
  subagents?: AgentNode[];
}

export type OutputType = 'text' | 'image' | 'music' | 'video';
export interface AgenticSystem {
  id: string;
  teamName: string;
  teamType: string;
  teamDescription: string;
  color: string;
  outputType: OutputType;
  outputModel: string;
  outputAutoApprove?: boolean;
  user: {
    index: number;
    model: string;
    position?: { x: number; y: number };
  };
  leadAgent: AgentNode;
}

const BASE_SETS: AgenticSystem[] = [
  {
    id: 'unboring-net',
    teamName: 'unboring.net',
    teamType: 'Agency',
    teamDescription: 'A full-service creative agency covering branding, design, development and go-to-market strategy.',
    color: '#4285F4',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'agency-orchestrator',
      index: 1,
      name: 'Creative Director',
      description: 'Orchestrates branding, design, and development to deliver integrated creative solutions.',
      color: '#4285F4',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'agency-developer',
          index: 2,
          name: 'Developer',
          description: 'Architects and develops robust digital platforms and interactive experiences.',
          color: '#34A853',
          model: DEFAULT_MODELS.text,
          position: { x: -300, y: 280 }
        },
        {
          id: 'agency-designer',
          index: 3,
          name: 'Designer',
          description: 'Crafts visual identities, user interfaces, and premium brand aesthetics.',
          color: '#FBBC05',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 280 }
        },
        {
          id: 'agency-copywriter',
          index: 4,
          name: 'Copywriter',
          description: 'Crafts compelling narratives and strategic messaging for brands.',
          color: '#EA4335',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: 300, y: 280 }
        }
      ]
    }
  },
  {
    id: 'photo-studio',
    teamName: 'Nano Banana Lab',
    teamType: 'Visual',
    teamDescription: 'Pro image generation using the [Subject] + [Action] + [Context] + [Comp] + [Style] formula.',
    color: '#FBBF24',
    outputType: 'image',
    outputModel: DEFAULT_MODELS.image,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'art-director',
      index: 1,
      name: 'Art Director',
      description: 'Synthesizes descriptions into valid Nano Banana prompts.',
      color: '#FBBF24',
      humanInTheLoop: true,
      model: DEFAULT_MODELS.text,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'scene-designer',
          index: 2,
          name: 'Scene Designer',
          description: 'Focuses on Subject and Action within the scene.',
          color: '#F59E0B',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: -150, y: 280 }
        },
        {
          id: 'lighting-stylist',
          index: 3,
          name: 'Lighting Stylist',
          description: 'Focuses on Composition, Lighting, and Style/Materiality.',
          color: '#E0E672',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: 150, y: 280 }
        }
      ]
    }
  },
  {
    id: 'music-studio',
    teamName: 'Lyria Factory',
    teamType: 'Music Production',
    teamDescription: 'High-fidelity audio production following Lyria guidelines.',
    color: '#43E47C',
    outputType: 'music',
    outputModel: DEFAULT_MODELS.music,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'master-producer',
      index: 1,
      name: 'Master Producer',
      description: 'Orchestrates the 4 pillars of sound into a cohesive track.',
      color: '#43E47C',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'genre-expert',
          index: 2,
          name: 'Genre Expert',
          description: 'Defines style, mood, and global aesthetic (e.g., Synthwave, Lofi).',
          color: '#74D295',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -450, y: 280 }
        },
        {
          id: 'tempo-architect',
          index: 3,
          name: 'Tempo Architect',
          description: 'Specifies BPM, rhythmical complexity, and time signatures.',
          color: '#92D540',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -150, y: 280 }
        },
        {
          id: 'instrumentalist',
          index: 4,
          name: 'Instrumentalist',
          description: 'Selects timbres, arrangement, and orchestration layers.',
          color: '#40D5AD',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 150, y: 280 }
        },
        {
          id: 'dynamics-engineer',
          index: 5,
          name: 'Dynamics Engineer',
          description: 'Controls volume, texture, contrast, and emotional progression.',
          color: '#50BB55',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 450, y: 280 }
        }
      ]
    }
  },
  {
    id: 'film-studio',
    teamName: 'Veo Studio',
    teamType: 'Cinematic',
    teamDescription: 'Full cinematic production: Visuals + Soundstage (Veo 3.1 style).',
    color: '#E64347',
    outputType: 'video',
    outputModel: DEFAULT_MODELS.video,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'film-director',
      index: 1,
      name: 'Film Director',
      description: 'Orchestrates visuals and soundstage with global cinematic vision.',
      color: '#E64347',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'visual-lead',
          index: 2,
          name: 'Visual Lead',
          description: 'Manages cinematography and VFX direction.',
          color: '#F17DC5',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -200, y: 280 },
          subagents: [
            {
              id: 'cinematographer',
              index: 4,
              name: 'Cinematographer',
              description: 'Defines camera work, shot composition, and subject action.',
              color: '#E643C5',
              model: DEFAULT_MODELS.text,
              position: { x: -200, y: 430 }
            }
          ]
        },
        {
          id: 'audio-lead',
          index: 3,
          name: 'Audio Lead',
          description: 'Manages the soundstage: Dialogue, SFX, and Ambience.',
          color: '#7CE630',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 200, y: 280 },
          subagents: [
            {
              id: 'sound-designer',
              index: 5,
              name: 'Sound Designer',
              description: 'Specifies SFX (SFX:), Ambient Noise (Ambient noise:), and Dialogue (" ").',
              color: '#50BB55',
              model: DEFAULT_MODELS.text,
              position: { x: 200, y: 430 }
            }
          ]
        }
      ]
    }
  },
  {
    id: 'strategy-coach',
    teamName: 'Strategy Coach',
    teamType: 'Strategic',
    teamDescription: 'A high-level strategic advisor for project direction and roadmap.',
    color: '#64748B',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'visionary-advisor',
      index: 1,
      name: 'Visionary Advisor',
      description: 'Handles project direction, roadmap, and ecosystem growth strategy.',
      color: '#64748B',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 }
    }
  },
  {
    id: 'teacher-proxy-black',
    teamName: '教員代行努ブラック',
    teamType: '教育支援',
    teamDescription: 'CEO（ユーザー）からの依頼を受け、実践事例のリサーチから単元計画、ワークシート・掲示物、支援案までを一気通貫で作成する教員業務代行チーム。',
    color: '#3B82F6',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'edu-president',
      index: 1,
      name: '社長',
      description: 'あなたはこのチーム『教員代行努ブラック』の社長です。CEO（人間）から単元名・学年・教科・やりたいこと（授業で実現したい内容）の指示を受け取ったら、以下の手順で業務を遂行してください。\n1. 仕事を分解：指示を、リサーチ部・アイデア研究部・カリキュラム設計部・授業デザイン部・児童理解部・教材開発部・評価部の各部署への具体的なタスクに分解する。\n2. 各部署へ発注：分解したタスクを、対応する各エージェントに割り当てて発注する。\n3. 成果物を統合：各エージェントから提出された成果物を収集し、矛盾なく一つの『授業準備セット』としてまとめた統合ドキュメントを作成する。\n4. 矛盾・不足を検査：統合ドキュメントをQA・監査部に渡し、内容の矛盾や抜け漏れ、学習指導要領との整合性をチェックさせる。\n5. CEOに確認：QA・監査部の合格レポートとともに統合成果物をCEO（人間）に提示し、承認を求める。\n6. 修正：CEOから修正指示があれば、それを該当タスクに反映し、担当エージェントに再作業を依頼したうえで、再度2〜5の手順を繰り返す。\n進捗はカンバンボードで管理し、情報が不足しているエージェントには再依頼や具体的な修正指示を出してください。CEOの最終承認が得られたら deliver_project してください。',
      color: '#3B82F6',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'edu-research',
          index: 2,
          name: 'リサーチ部',
          description: 'あなたはこのチームのリサーチ部です。社長から指定された単元名・教科・学年をもとに、他校や現場教員による実践事例を複数（実践A、実践Bなど）調査してください。単なる検索結果の羅列で終わらせず、実践ごとに①特徴（どのような指導方法・工夫か）、②メリット、③デメリット・注意点、④学級適合度（対象学年や想定されるクラスの実態にどの程度合うか、向き不向き）を整理し、それらを比較したうえで社長・CEOがどの実践を採用すべきか判断できるよう、あなた自身の提案（推奨する実践とその理由、複数の実践を組み合わせる場合の案など）を添えて「実践リサーチレポート」としてまとめて報告してください。信頼性や実践での再現性を重視し、憶測や不確かな情報は「推測」と明示してください。',
          color: '#8B5CF6',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -700, y: 280 }
        },
        {
          id: 'edu-idea',
          index: 3,
          name: 'アイデア研究所',
          description: 'あなたはこのチームのアイデア研究所（エージェント名: アイデア研究員）です。児童がワクワクするような面白いアイデアを量産することが役割です。社長から共有された単元名・教科・学年をもとに、児童が思わず驚くような導入のアイデアと、単元を通して児童の興味を引きつける問い（発問）のアイデアを大量に発想してください。加えて、タブレットなどICTを活用した活動や教室環境・掲示物のアイデア（ICT活用・環境）、他教科と連携させる教科横断のアイデア（例: 算数の内容を体育で実践するなど）も積極的に発想してください。実現可能性よりもまず発想の量と面白さを優先し、「導入」「問い」「ICT活用・環境」「教科横断」のカテゴリごとに分け、それぞれのアイデアがどの学習場面（導入・展開・まとめ）に適するかを添えて、カリキュラム設計部・授業デザイン部が採用しやすい形でリストアップしてください。',
          color: '#A78BFA',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -500, y: 280 }
        },
        {
          id: 'edu-curriculum',
          index: 4,
          name: 'カリキュラム設計部',
          description: 'あなたはこのチームのカリキュラム設計部です。リサーチ部・アイデア研究部の成果をもとに、単元目標、評価規準、単元計画（全体の時数配分と単元の流れ）、各時間のねらい、そして単元全体を貫く問い（児童が単元を通して追究する中心的な問い）を含む「単元全体設計図」を作成してください。学習指導要領との整合性、児童の既習事項や発達段階を踏まえ、無理のない指導計画になるよう組み立てるとともに、各時間のねらいが単元を貫く問いにどうつながるかが一目で分かる構成にし、授業デザイン部が本時案をそのまま作成できるレベルまで単元全体の位置づけを明確にしてください。',
          color: '#F59E0B',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -300, y: 280 }
        },
        {
          id: 'edu-lesson-design',
          index: 5,
          name: '授業デザイン部',
          description: 'あなたはこのチームの授業デザイン部です。カリキュラム設計部が作成した『単元全体設計図』（各時間のねらい、単元を貫く問いなど）に基づいて、本時（1時間）の授業を設計してください。めあて、導入・展開・まとめの流れ、主な発問・指示、時間配分の目安、板書計画などを盛り込み、アイデア研究部の着想も活かしてください。成果物は、見出し・箇条書き・表を用いたMarkdown形式の「授業展開案」として、児童理解部・教材開発部・評価部がそのまま参照できるよう構成要素ごとに明確に分けて出力してください。',
          color: '#FBBF24',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -100, y: 280 }
        },
        {
          id: 'edu-student-support',
          index: 6,
          name: '児童理解・つまずき対策部',
          description: 'あなたはこのチームの児童理解・つまずき対策部（エージェント名: Student Support Specialist）です。児童の心理と発達を深く理解し、学習上の困難を予測して支援する「児童理解スペシャリスト」として、授業デザイン部が作成した授業展開案に対して児童の視点からつまずきを分析してください。読み書きの困難、集中の持続、指示理解の遅れ、対人関係などつまずきが起こりうる場面を具体的に洗い出したうえで、それぞれに対して段階的に達成できる具体的でスモールステップの支援策（声かけの例、補助教材、座席・グルーピングの配慮など）を提示してください。教材開発部・評価部が配慮を反映しやすいよう、つまずきの場面ごとに整理して報告してください。',
          color: '#14B8A6',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 100, y: 280 }
        },
        {
          id: 'edu-material',
          index: 7,
          name: '教材開発部',
          description: 'あなたはこのチームの教材開発部（エージェント名: Material Developer）です。視覚的に分かりやすく、学習効果の高い教材を作成する「教材クリエイター」として、授業デザイン部の授業展開案と児童理解・つまずき対策部の支援策をもとに、必要な教材（ワークシート、黒板掲示物、提示資料など）を作成してください。ユニバーサルデザイン（UD）の視点—情報の焦点化・視覚化・共有化—に加え、特別支援の視点（構造化、視覚化）を取り入れ、文字情報だけに頼らず、図表・アイコン・色分け・レイアウト（余白や文字サイズ、記入欄の配置）などの具体的な指示を含め、学習が苦手な児童にも分かりやすい構造化された教材案としてまとめてください。成果物は見出し・箇条書き・表を用いたMarkdown形式で出力し、将来的にPDFやWordへ自動変換できるよう、レイアウトや配置の指示は本文と区別しやすい形（表や注記など）で明記してください。',
          color: '#EC4899',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 300, y: 280 }
        },
        {
          id: 'edu-evaluation',
          index: 8,
          name: '評価部',
          description: 'あなたはこのチームの評価部です。学習と評価を一体化させ、児童の成長を見取る「評価スペシャリスト」として、カリキュラム設計部の単元全体設計図と授業デザイン部の授業展開案をもとに評価計画を作成してください。評価規準は「知識・技能」「思考・判断・表現」「主体的に学習に取り組む態度」の3観点に基づき、単元全体を通した評価規準と、本時のねらいに沿った具体的な評価規準（A・B・C等の観点別到達度の目安を含むルーブリック）の両方を作成し、教員が机間指導や振り返りの際にすぐ使える形でまとめてください。',
          color: '#10B981',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 500, y: 280 }
        },
        {
          id: 'edu-qa',
          index: 9,
          name: 'QA・監査部',
          description: 'あなたはこのチームの監査部（エージェント名: QA（品質保証）アナリスト）です。全成果物を客観的にチェックし、品質を保証することが役割です。社長エージェントから渡された、各部署の統合成果物（単元全体設計図・授業展開案・教材・支援策・評価計画などをまとめたもの）を監査し、①学習指導要領と整合しているか、②各部署の成果物間に論理的矛盾や重複、抜け漏れがないか、③内容が対象学年の児童にとって適切（発達段階・認知負荷・安全面などの観点）であるかを保証してください。監査にあたっては、(a) 不整合の指摘：NGと判定した項目について具体的な理由と不整合がある箇所を明示する、(b) 修正提案：指摘した不整合を修正するための具体的な改善案を提示する、(c) 誤情報・出典の確認：生成された情報に明らかな誤りがないか、出典が明記されているかを確認する、の3点を必ず行ってください。すべての基準を満たしていれば合格レポートとして社長に報告してください。',
          color: '#EF4444',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 700, y: 280 }
        }
      ]
    }
  },
  {
    id: 'pr-agency',
    teamName: 'PR Agency',
    teamType: 'Public Relations',
    teamDescription: 'A sequential pipeline for media outreach: from strategy to press drafting.',
    color: '#E34B99',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'pr-director',
      index: 1,
      name: 'PR Director',
      description: 'Oversees media relations, strategic communications, and brand reputation.',
      color: '#E34B99',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'media-strategist',
          index: 2,
          name: 'Media Strategist',
          description: 'Identifies key media outlets and manages journalist outreach.',
          color: '#E6D979',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 260 },
          subagents: [
            {
              id: 'press-writer',
              index: 3,
              name: 'Press Writer',
              description: 'Drafts press releases and media kits based on strategic goals.',
              color: '#5E888E',
              model: DEFAULT_MODELS.text,
              position: { x: 0, y: 390 }
            }
          ]
        }
      ]
    }
  }
];

/** 特別支援学級向けチーム（docs/teacher-edition-design.md）を含めた全チーム。 */
export const AGENTIC_SETS: AgenticSystem[] = [...BASE_SETS, ...SPECIAL_NEEDS_SETS];

export function getAgentSet(id: string, customSystems: AgenticSystem[] = []): AgenticSystem {
  return (
    customSystems.find((s) => s.id === id) ||
    AGENTIC_SETS.find((s) => s.id === id) ||
    AGENTIC_SETS[0]
  );
}

export function getAllAgents(system: AgenticSystem): AgentNode[] {
  const agents: AgentNode[] = [];
  const traverse = (node: AgentNode) => {
    agents.push(node);
    if (node.subagents) {
      node.subagents.forEach(traverse);
    }
  };
  traverse(system.leadAgent);
  return agents;
}

export function getAllCharacters(system: AgenticSystem): AgentNode[] {
  const userNode: AgentNode = {
    id: USER_ID,
    index: system.user.index,
    name: USER_NAME,
    color: USER_COLOR,
    model: system.user.model,
    description: 'Human user issuing commands.',
  };
  return [userNode, ...getAllAgents(system)];
}
