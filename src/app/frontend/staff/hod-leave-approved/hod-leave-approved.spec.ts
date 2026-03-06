import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HodLeaveApproved } from './hod-leave-approved';

describe('HodLeaveApproved', () => {
  let component: HodLeaveApproved;
  let fixture: ComponentFixture<HodLeaveApproved>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HodLeaveApproved]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HodLeaveApproved);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
