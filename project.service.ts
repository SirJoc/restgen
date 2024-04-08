import { Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProjectDto, ProjectRequest } from './dto';
import { exec } from 'child_process';
import * as fs from 'fs';
import { OpenaiApiService } from 'src/openai-api/openai-api.service';
import { GetPromptInput } from 'src/openai-api/models';
import { HotObservable } from 'rxjs/internal/testing/HotObservable';
import { AIMessage } from 'langchain/schema';
import { log } from 'console';
import * as path from 'path';
import * as archiver from 'archiver';

@Injectable()
export class ProjectService {
  user: number = 4;
  projectDestination: string = this.config.get('PROJECT_DEST');
  projectZips: string = this.config.get('PROJECT_ZIP');
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly service: OpenaiApiService,
  ) {}

  async readFile(file: Express.Multer.File, user: number) {
    const fileData = file.buffer.toString('utf-8');
    const lines = fileData; //.split('\n');
    const create = this.prisma.project.create({
      data: {
        title: 'Proyecto nuevo',
        description: 'descripcion nueva',
        link: 'nuevo-enlace',
        path: this.projectDestination,
        userId: user,
      },
    });
    const updateProject = await this.prisma.project.update({
      where: {
        id: (await create).id,
      },
      data: {
        path: this.projectDestination + (await create).id,
      },
    });
    // this.createModelsPrisma(lines);
    // this.generateProject();
    // this.generateProject(this.projectDestination);
    const res = await this.generateProject(updateProject.path);
    console.log('AQUI COMIENZA');
    const resultado = await this.createModelsPrisma(
      lines,
      updateProject.path,
      updateProject.id.toString(),
    );
    // this.createEnvFile(updateProject.id.toString());
    const zipPath = await this.createAndReturnZipPath(updateProject.id.toString());
    const updateModelsProject = await this.prisma.project.update({
      where: {
        id: (await create).id,
      },
      data: {
        models: resultado.length,
      },
    });
    //this.service.getAiModelAnswer(data);
    return updateModelsProject;
  }

  async createModelsPrisma(script: string, path: string, project: string): Promise<string[]> {
    const modelsNames = [];
    const models = [];
    const regex = /model\s+(\w+)\s*{/;
    const headerModels =
      'DONT MAKE TYPESCRIPT CODE FOR THIS RESPONSE. SERIALIZE RESPONSE. ONLY PRISMA LANGUAGE. AUTOINCREMENT ID. SOURCE CODE FOR PRISMA FILE GIVEN THE NEXT SQL SCRIPT. ONLY MODELS. ONLY CODE TAG IN THE REPONSE. ' +
      script;

    // TODO: CREATE SERVICIO FOR OPENAI
    const prompt = new GetPromptInput();
    prompt.message = headerModels;
    const resultado = await this.service.getAiModelAnswer(prompt);
    const modelsString = this.deleteUntilSpecificWord(
      this.extractContent(resultado.aiMessage),
      'model',
    );
    const n = (await setTimeout(function () {
      /* snip */
    }, 500)) as unknown as number;
    // TODO: RESPONSE -> WITH CODE FILTER WITH MODELS
    models.push(
      ...modelsString
        .split('model ')
        .filter(Boolean)
        .map((model) => `model ${model.trim()}`),
    );
    const no = (await setTimeout(function () {
      /* snip */
    }, 500)) as unknown as number;
    for (const model of models) {
      const match = model.match(regex);
      if (match && match[1]) {
        const modelName = match[1];
        modelsNames.push(modelName.toLowerCase());
      }
    }

    const headerPrisma = `
    generator client {
      provider = "prisma-client-js"
    }
    
    datasource db {
      provider = "postgresql"
      url      = ${this.config.get('GENERATED_DB_URL') + this.config.get('SCHEMA_URL') + project}
    }
    `;

    const batPath = path + this.config.get('PRISMA_PATH');
    let lines = headerPrisma + '\n\n';
    for (const i of models) {
      lines += i + '\n';
    }
    fs.writeFileSync(batPath, lines, 'utf-8');
    this.generateScriptBat(modelsNames, modelsString, path);
    return models;
  }

  createEnvFile(project: string): void {
    fs.writeFileSync(
      this.projectDestination + project + '/.env',
      'DATABASE_URL=' +
        '"' +
        this.config.get('GENERATED_DB_URL') +
        this.config.get('SCHEMA_URL') +
        project +
        '"',
      'utf-8',
    );
  }

  async downloadFile(project: string): Promise<StreamableFile> {
    // const found = await this.prisma.project.findFirst({
    // 	where: { id: project.id },
    // });

    // if (!found) {
    // 	throw new NotFoundException(`invoice with ${project.id} not found`);
    // }
    // const file = createReadStream(project.path);
    const file = fs.createReadStream(this.projectZips + project + '.zip');
    return new StreamableFile(file);
  }

  async createAndReturnZipPath(project: string) {
    const sourceDir = path.join('', this.projectDestination + project); // Replace with your source directory
    const zipFileName = 'dev_' + project + '.zip';
    const zipFilePath = path.join('/home/ubuntu/Projects/zips', zipFileName);

    // Ensure the source directory exists
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory not found: ${sourceDir}`);
    }

    // Create a write stream for the zip file
    const output = fs.createWriteStream(zipFilePath);

    // Create an archiver object with zip format
    const archive = archiver('zip', {
      zlib: { level: 9 }, // compression level (0 to 9)
    });

    // Pipe archive data to the output file
    archive.pipe(output);

    // Add the entire directory to the zip archive
    archive.directory(sourceDir, false);

    // Finalize the archive and close the output stream
    await archive.finalize();

    // Return the path to the generated zip file
    return zipFilePath;
  }

  async fullfillFiles(models: string[], urlFiles: string[], scriptPrisma: string, path: string) {
    const rutasProject: string[] = [];
    for (const model of models) {
      for (const urlFile of urlFiles) {
        if (urlFile.includes(model.toLowerCase())) {
          const ruta = urlFile.replace(/\//g, '/');
          rutasProject.push(path + '/' + ruta);
        }
      }
    }

    const controllers = rutasProject.filter((e) => e.includes('controller'));
    const services = rutasProject.filter((e) => e.includes('service'));

    // TODO: CONTENT WITH OPEN AI
    const startingWith =
      'Give me only source code without any statement. NO COMMENTS EXCEPT FOR THE FILE NAME. NO CREATE DTO FILES. PRISMA SERVICE IS INSIDE src/prisma/prisma.service. Create ONLY controllers and services using prisma for CRUD operations with their DECORATORS Body and Param for the controllers and imports from the next prisma models. The TYPE PARAMETERS will be of type ANY. Source code in NestJS. Only code tag in the response. You are not enabled to skip files. ';

    const prompt = new GetPromptInput();
    prompt.message = startingWith + scriptPrisma;
    const resultado = (await this.service.getAiModelAnswer(prompt)).aiMessage;
    const contentResponse = this.extractContentArray(resultado.replace('typescript', ''));
    const response = [];
    for (const res of contentResponse) {
      response.push(...res.split('//'));
    }
    // todo: manager response
    for (const model of models) {
      for (const content of response) {
        if (
          content.includes(
            'export class ' + model.charAt(0).toUpperCase() + model.slice(1) + 'Controller',
          )
        ) {
          for (const controller of controllers) {
            if (controller.includes(model)) {
              console.log('CONTROLLER--------', content);
              fs.writeFileSync(controller, '///' + content, 'utf-8');
            }
          }
        }
        if (
          content.includes(
            'export class ' + model.charAt(0).toUpperCase() + model.slice(1) + 'Service',
          )
        ) {
          for (const service of services) {
            if (service.includes(model)) {
              console.log('SERVICE-----------', content);
              fs.writeFileSync(service, '///' + content, 'utf-8');
            }
          }
        }
      }
    }
  }

  generateScriptBat(models: string[], scriptPrisma: string, path: string): Promise<string[]> {
    const batPath = path + '/script.sh';

    let lines = 'cd ' + path + '\n';
    for (const i of models) {
      lines += 'nest g co ' + i + ' --no-spec \n\n';
      lines += 'nest g s ' + i + ' --no-spec \n\n';
    }
    fs.writeFileSync(batPath, lines, 'utf-8');
    return new Promise((resolve, reject) => {
      this.runBatFile(batPath)
        .then((response) => {
          const resultado = response
            .map(this.extractPath)
            .filter((path) => path !== null) as string[];
          this.fullfillFiles(models, resultado, scriptPrisma, path);
          resolve(response);
        })
        .catch((error) => {
          reject(`Error: ${error.message}`);
        });
    });
  }

  runBatFile(pathBat: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const batFilePath = pathBat;
      const filesControllers: string[] = [];
      exec('chmod u+x ' + batFilePath);
      const batProcess = exec('bash ' + batFilePath);

      batProcess.stdout.on('data', (data) => {
        const dataString = String(data);
        if (dataString.includes('src')) {
          filesControllers.push(dataString);
        }
        console.log(`stdout: ${dataString}`);
      });

      batProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        reject(new Error(`stderr: ${data}`));
      });

      batProcess.on('exit', (code) => {
        console.log(`Child process exited with code ${code}`);
        if (code === 0) {
          resolve(filesControllers);
        } else {
          reject(new Error(`Child process exited with code ${code}`));
        }
      });
    });
  }

  async generateProject(path: string) {
    console.log('...loading');
    this.copyDirectory(this.config.get('PROJECT'), path);
    console.log('completed...');
  }

  copyDirectory(sourcePath: string, destinationPath: string) {
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath, { recursive: true });
    }

    const files = fs.readdirSync(sourcePath);

    files.forEach((file) => {
      const sourceFile = `${sourcePath}/${file}`;
      const destinationFile = `${destinationPath}/${file}`;

      if (fs.lstatSync(sourceFile).isDirectory()) {
        this.copyDirectory(sourceFile, destinationFile);
      } else {
        fs.copyFileSync(sourceFile, destinationFile);
      }
    });
  }

  extractPath(updateString: string): string | null {
    const regex = /\x1B\[32mCREATE\x1B\[39m\s+([\S\s]+?)\s+\(\d+ bytes\)/;
    const match = updateString.match(regex);
    return match ? match[1] : null;
  }

  extractContent(input: string): string {
    const matches = input.match(/`([^`]+)`/);
    return matches ? matches[1] : '';
  }

  extractContentArray(input: string): string[] {
    const regex = /```([\s\S]+?)```/g;
    const matches = input.match(regex);
    return matches ? matches.map((match) => match.replace(/```/g, '').trim()) : [];
  }

  deleteUntilSpecificWord(input: string, targetWord: string): string {
    const index = input.indexOf(targetWord);
    return index !== -1 ? input.slice(index) : input;
  }

  async deployProject(project: string): Promise<string[]> {
    const batPath = this.projectDestination + project + '/deployScript.sh';

    const lines = 'cd ' + this.projectDestination + project + '\nnpm run deploy';
    fs.writeFileSync(batPath, lines, 'utf-8');
    return new Promise((resolve, reject) => {
      this.runBatFile(batPath)
        .then((response) => {
          resolve(response);
        })
        .catch((error) => {
          reject(`Error: ${error.message}`);
        });
    });
  }
}
